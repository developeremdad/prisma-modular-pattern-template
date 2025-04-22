import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';
import httpStatus from 'http-status';
import config from '../../../config';
import QueryBuilder from '../../builder/QueryBuilder';
import AppError from '../../errors/AppError';
import { verification } from '../../errors/helpers/generateEmailVerificationLink';
import prisma from '../../utils/prisma';
import Email from '../../utils/sendMail';
import {
  failedEmailVerificationHTML,
  successEmailVerificationHTML,
} from './user.constant';

interface UserWithOptionalPassword extends Omit<User, 'password'> {
  password?: string;
}
// Function to get the keys of a model
async function getModelKeys(modelName: string): Promise<string[]> {
  try {
      // Dynamically access the model from the Prisma client
      const model = (prisma as any)[modelName];  // Type assertion to 'any'

      if (!model) {
          console.warn(`Model '${modelName}' not found on Prisma client.`);
          return [];
      }

      // Attempt to find the first record of the model
      const sampleRecord = await model.findFirst();

      if (!sampleRecord) {
          console.warn(`No records found for model '${modelName}'. Ensure your database has at least one record to correctly retrieve model keys.`);
          return [];
      }

      // Extract the keys from the sample record object
      const keys = Object.keys(sampleRecord);
      return keys;

  } catch (error) {
      console.error(`Error getting model keys for '${modelName}':`, error);
      return [];
  } finally {
      await prisma.$disconnect();
  }
}
const registerUserIntoDB = async (payload: User) => {
  const hashedPassword: string = await bcrypt.hash(payload.password, 12);
  const userData = {
    ...payload,
    password: hashedPassword,
  };
  const newUser = await prisma.user.create({
    data: {
      ...userData,
    },
  });

  await resendUserVerificationEmail(newUser.email);
  const userWithOptionalPassword = newUser as UserWithOptionalPassword;
  delete userWithOptionalPassword.password;

  return userWithOptionalPassword;
};

const getAllUsersFromDB = async (query: any) => {
  const keys = await getModelKeys('user');
  const usersQuery = new QueryBuilder(prisma.user, query, keys);
  const result = await usersQuery
    .search(['firstName', 'lastName', 'email'])
    .filter()
    .sort()
    .fields()
    .exclude()
    .paginate()
    .execute();
  const pagination = await usersQuery.countTotal();

  return {
    meta: pagination,
    result,
  };
};

const getMyProfileFromDB = async (id: string) => {
  const Profile = await prisma.user.findUniqueOrThrow({
    where: {
      id: id,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return Profile;
};

const getUserDetailsFromDB = async (id: string) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return user;
};

const updateMyProfileIntoDB = async (id: string, payload: any) => {
  const userProfileData = payload.Profile;
  delete payload.Profile;

  const userData = payload;

  // update user data
  await prisma.$transaction(async (transactionClient: any) => {
    // Update user data
    const updatedUser = await transactionClient.user.update({
      where: { id },
      data: userData,
    });

    // Update user profile data
    const updatedUserProfile = await transactionClient.Profile.update({
      where: { userId: id },
      data: userProfileData,
    });

    return { updatedUser, updatedUserProfile };
  });

  // Fetch and return the updated user including the profile
  const updatedUser = await prisma.user.findUniqueOrThrow({
    where: { id },
  });

  const userWithOptionalPassword = updatedUser as UserWithOptionalPassword;
  delete userWithOptionalPassword.password;

  return userWithOptionalPassword;
};

const updateUserRoleStatusIntoDB = async (id: string, payload: any) => {
  const result = await prisma.user.update({
    where: {
      id: id,
    },
    data: payload,
  });
  return result;
};

const changePassword = async (user: any, payload: any) => {
  const userData = await prisma.user.findUniqueOrThrow({
    where: {
      email: user.email,
      status: 'ACTIVE',
    },
  });

  const isCorrectPassword: boolean = await bcrypt.compare(
    payload.oldPassword,
    userData.password,
  );

  if (!isCorrectPassword) {
    throw new Error('Password incorrect!');
  }

  const hashedPassword: string = await bcrypt.hash(payload.newPassword, 12);

  await prisma.user.update({
    where: {
      id: userData.id,
    },
    data: {
      password: hashedPassword,
    },
  });

  return {
    message: 'Password changed successfully!',
  };
};

const resendUserVerificationEmail = async (email: string) => {
  const [emailVerificationLink, hashedToken] =
    verification.generateEmailVerificationLink();

  const user = await prisma.user.update({
    where: { email: email },
    data: {
      emailVerificationToken: hashedToken,
      emailVerificationTokenExpires: new Date(Date.now() + 3600 * 1000),
    },
  });

  const emailSender = new Email(user);
  await emailSender.sendEmailVerificationLink(
    'Email verification link',
    emailVerificationLink,
  );
  return user;
};

const verifyUserEmail = async (res: Response, token: string) => {
  const hashedToken = verification.generateHashedToken(token);
  const user = await prisma.user.findFirst({
    where: {
      emailVerificationToken: hashedToken,
    },
  });

  if (!user) {
    // throw new AppError(
    //   httpStatus.BAD_REQUEST,
    //   'Invalid email verification token.',
    // );

    res.send(failedEmailVerificationHTML(config.base_url_client as string));
    return;
  }

  if (
    user &&
    user.emailVerificationTokenExpires &&
    user.emailVerificationTokenExpires < new Date(Date.now())
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Email verification token has expired. Please try resending the verification email again.',
    );
  }
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      isEmailVerified: true,
      emailVerificationToken: null,
      emailVerificationTokenExpires: null,
    },
  });

  if (updatedUser.isEmailVerified) {
    res.send(successEmailVerificationHTML());
    return updatedUser;
  }

  return updatedUser;
};

export const UserServices = {
  registerUserIntoDB,
  getAllUsersFromDB,
  getMyProfileFromDB,
  getUserDetailsFromDB,
  updateMyProfileIntoDB,
  updateUserRoleStatusIntoDB,
  changePassword,
  resendUserVerificationEmail,
  verifyUserEmail,
};
