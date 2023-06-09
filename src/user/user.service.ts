import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import CryptoJS from 'crypto-js';
import dayjs from 'dayjs';
import identity from 'lodash/identity';
import isEmpty from 'lodash/isEmpty';
import pickBy from 'lodash/pickBy';
import { Model } from 'mongoose';
import { AES_SECRET_KEY_PASSWORD } from 'src/constant';
import {
  FOLLOW_IDS_IS_REQUIRED,
  NO_EXECUTE_PERMISSION,
  PASSWORD_IS_REQUIRED,
  USER_ALREADY_EXISTS,
} from 'src/constant/response-code';
import { BaseUserDto } from './dto/base-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserDocument } from './schemas/user.schema';

interface QueryFindAll {
  page?: number | string;
  size?: number | string;
  keyword?: number | string;
  subjectId?: string;
  sort?: string;
  role?: string;
}

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private readonly model: Model<UserDocument>,
  ) {}

  async findAll(query: QueryFindAll): Promise<any> {
    const { role, page, size, keyword = '', subjectId, sort } = query || {};
    if (role === 'ADMIN') {
      return [];
    }
    const pageQuery = Number(page) || 1;
    const sizeQuery = Number(size) || 10;
    const queryDb = pickBy(
      {
        role,
        status: 'ACTIVE',
        fullName: { $regex: '.*' + keyword + '.*' },
        // username: { $regex: '.*' + keyword + '.*' },
      },
      identity,
    );
    const querySort = {};
    if (sort) {
      const [field, type] = sort.split(' ');
      if (type === 'asc') {
        querySort[field] = 1;
      }
      if (type === 'desc') {
        querySort[field] = -1;
      }
    }

    if (subjectId) {
      queryDb.subjectIds = { $in: [subjectId] };
    }

    const numOfItem = await this.model.count(queryDb);

    let dataList = [];

    if (sort && sort.split(' ')[0] === 'followers') {
      const sortType = sort.split(' ')[1] === 'asc' ? 1 : -1;
      dataList = await this.model
        .aggregate([
          { $match: queryDb },
          {
            $project: {
              username: 1,
              fullName: 1,
              createdAt: 1,
              subjectIds: 1,
              numOfExam: 1,
              updatedAt: 1,
              role: 1,
              status: 1,
              followers: 1,
              following: 1,
              avatar: 1,
              school: 1,
              address: 1,
              phone: 1,
              gender: 1,
              numOfFollower: { $size: { $ifNull: ['$followers', []] } },
            },
          },
          { $sort: { numOfFollower: sortType } },
        ])
        .skip(pageQuery > 1 ? (pageQuery - 1) * sizeQuery : 0)
        .limit(sizeQuery);
      dataList = dataList.map((i) => {
        const { _id, numOfFollower, ...rest } = i;
        return { ...rest, id: _id };
      });
    } else {
      dataList = await this.model
        .find(queryDb, { password: 0, __v: 0 })
        .sort(querySort)
        .limit(sizeQuery)
        .skip(pageQuery > 1 ? (pageQuery - 1) * sizeQuery : 0);
    }

    // const dataList = await this.model
    //   .find(queryDb, { password: 0, __v: 0 })
    //   .sort(querySort)
    //   .limit(sizeQuery)
    //   .skip(pageQuery > 1 ? (pageQuery - 1) * sizeQuery : 0);

    return {
      data: dataList,
      pagination: {
        page: pageQuery,
        size: sizeQuery,
        total: numOfItem,
      },
    };
  }

  async count(query: QueryFindAll): Promise<any> {
    const { role } = query || {};
    if (role === 'ADMIN') {
      return [];
    }
    const queryDb = pickBy(
      {
        role,
        status: 'ACTIVE',
      },
      identity,
    );

    const numOfItem = await this.model.count(queryDb);

    return {
      count: numOfItem,
    };
  }

  async findFollowing(
    query: Record<string, unknown>,
    authUser: BaseUserDto,
  ): Promise<any> {
    const { role, page, size, keyword = '', subjectId } = query || {};
    const { id: authId } = authUser;

    if (role === 'TEACHER') {
      return [];
    }

    const currentUser = await this.model.findById(authId);
    const { following } = currentUser.toObject();

    if (!following.length) {
      return [];
    }

    const pageQuery = Number(page) || 1;
    const sizeQuery = Number(size) || 10;
    const queryDb = pickBy(
      {
        role: 'TEACHER',
        status: 'ACTIVE',
        fullName: { $regex: '.*' + keyword + '.*' },
        _id: {
          $in: following,
        },
      },
      identity,
    );

    if (subjectId) {
      queryDb.subjectIds = { $in: [subjectId] };
    }

    const numOfItem = await this.model.count(queryDb);

    const dataList = await this.model
      .find(queryDb, { password: 0, __v: 0 })
      .limit(sizeQuery)
      .skip(pageQuery > 1 ? (pageQuery - 1) * sizeQuery : 0);

    return {
      data: dataList,
      pagination: {
        page: pageQuery,
        size: sizeQuery,
        total: numOfItem,
      },
    };
  }

  async findOne(id: string, authUser?: BaseUserDto): Promise<any> {
    const { id: authId } = authUser || {};
    const userDetail = await this.model.findOne(
      { _id: id },
      {
        password: 0,
        createdAt: 0,
        updatedAt: 0,
        __v: 0,
      },
    );

    const { followers = [], _id, ...rest } = userDetail.toObject();

    return {
      ...rest,
      id,
      followers,
      isFollowing: followers.includes(authId),
    };
  }

  async findOneWithUsername(username: string): Promise<User> {
    return await this.model.findOne({ username }).exec();
  }

  async findOneWithAccessToken(authUser: BaseUserDto): Promise<User> {
    const { username } = authUser;
    const currentUser = await this.model.findOne({ username }, { password: 0 });

    if (!currentUser) {
      throw new UnauthorizedException();
    }
    return currentUser;
  }

  async register(createUserDto: CreateUserDto): Promise<User> {
    const { role, password, username } = createUserDto || {};

    if (role !== 'STUDENT') {
      throw new ForbiddenException({
        code: NO_EXECUTE_PERMISSION,
        message: 'No execute permission',
      });
    }
    if (!password) {
      throw new HttpException(
        {
          message: 'Password is required',
          code: PASSWORD_IS_REQUIRED,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const existsUsername = await this.model.findOne({ username });

    if (!!existsUsername) {
      throw new HttpException(
        {
          message: 'User already exists',
          code: USER_ALREADY_EXISTS,
        },
        HttpStatus.CONFLICT,
      );
    }

    const encryptPassword = CryptoJS.AES.encrypt(
      `${password}`,
      AES_SECRET_KEY_PASSWORD,
    ).toString();

    return await new this.model({
      ...createUserDto,
      password: encryptPassword,
      createdAt: dayjs().valueOf(),
      status: 'ACTIVE',
    })
      .save()
      .then((response) => {
        const { password, _id, __v, ...rest } = response.toObject();
        return { id: _id, ...rest };
      });
  }

  async create(
    createUserDto: CreateUserDto,
    authUser: BaseUserDto,
  ): Promise<User> {
    const { role, password, username } = createUserDto || {};

    if (role !== 'STUDENT') {
      if (!authUser?.username || role === 'ADMIN') {
        throw new ForbiddenException({
          code: NO_EXECUTE_PERMISSION,
          message: 'No execute permission',
        });
      }

      const { role: authRole } = authUser;
      if (role === 'TEACHER' && authRole !== 'ADMIN') {
        throw new ForbiddenException({
          code: NO_EXECUTE_PERMISSION,
          message: 'No execute permission',
        });
      }
    }
    if (!password) {
      throw new HttpException(
        {
          message: 'Password is required',
          code: PASSWORD_IS_REQUIRED,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const existsUsername = await this.model.findOne({ username });

    if (!!existsUsername) {
      throw new HttpException(
        {
          message: 'User already exists',
          code: USER_ALREADY_EXISTS,
        },
        HttpStatus.CONFLICT,
      );
    }

    const encryptPassword = CryptoJS.AES.encrypt(
      `${password}`,
      AES_SECRET_KEY_PASSWORD,
    ).toString();

    return await new this.model({
      ...createUserDto,
      password: encryptPassword,
      createdAt: dayjs().valueOf(),
      status: 'ACTIVE',
      numOfExam: 0,
    })
      .save()
      .then((response) => {
        const { password, _id, __v, ...rest } = response.toObject();
        return { id: _id, ...rest };
      });
  }

  async checkExistsUsername(username: string): Promise<boolean> {
    const existsUsername = await this.model.findOne({ username });
    return !!existsUsername;
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    authUser: BaseUserDto,
  ): Promise<User> {
    if (authUser.id !== id) {
      throw new ForbiddenException({
        code: NO_EXECUTE_PERMISSION,
        message: 'No execute permission',
      });
    }
    return await this.model
      .findByIdAndUpdate(id, {
        ...updateUserDto,
        updatedAt: dayjs().valueOf(),
      })
      .exec();
  }

  async delete(id: string, authUser: BaseUserDto): Promise<User> {
    if (authUser.role !== 'ADMIN') {
      throw new ForbiddenException({
        code: NO_EXECUTE_PERMISSION,
        message: 'No execute permission',
      });
    }
    await this.model.findByIdAndUpdate(id, { status: 'INACTIVE' });
    return null;
  }

  async follow(
    body: { followIds: string[] },
    authUser: BaseUserDto,
  ): Promise<User> {
    const { followIds } = body || {};
    const { id: authId, role: authRole } = authUser;

    if (authRole !== 'STUDENT') {
      throw new ForbiddenException({
        code: NO_EXECUTE_PERMISSION,
        message: 'No execute permission',
      });
    }

    if (isEmpty(followIds)) {
      throw new HttpException(
        {
          message: 'followIds is required',
          code: FOLLOW_IDS_IS_REQUIRED,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const currentUser = await this.model.findById(authId);
    const oldFollowing = currentUser.following || [];

    await this.model.findOneAndUpdate(
      { _id: authId },
      {
        following: [...oldFollowing, ...followIds],
      },
    );

    await Promise.all(
      followIds.map(async (item) => {
        const teacher = await this.model.findById(item);
        const oldFollowers = teacher.followers || [];
        await this.model.findOneAndUpdate(
          { _id: item },
          { followers: [...oldFollowers, authId] },
        );
      }),
    );

    return null;
  }

  async unFollow(
    body: { followIds: string[] },
    authUser: BaseUserDto,
  ): Promise<User> {
    const { followIds } = body || {};
    const { id: authId, role: authRole } = authUser;

    if (authRole !== 'STUDENT') {
      throw new ForbiddenException({
        code: NO_EXECUTE_PERMISSION,
        message: 'No execute permission',
      });
    }

    if (isEmpty(followIds)) {
      throw new HttpException(
        {
          message: 'followIds is required',
          code: FOLLOW_IDS_IS_REQUIRED,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const currentUser = await this.model.findById(authId);
    const oldFollowing = currentUser.following || [];

    await this.model.findOneAndUpdate(
      { _id: authId },
      {
        following: oldFollowing.filter((item) => !followIds.includes(item)),
      },
    );

    await Promise.all(
      followIds.map(async (item) => {
        const teacher = await this.model.findById(item);
        const oldFollowers = teacher.followers || [];
        await this.model.findOneAndUpdate(
          { _id: item },
          { followers: oldFollowers.filter((i) => i !== authId) },
        );
      }),
    );

    return null;
  }
}
