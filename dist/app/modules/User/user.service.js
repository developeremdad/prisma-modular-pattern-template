"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserServices = void 0;
const bcrypt = __importStar(require("bcrypt"));
const http_status_1 = __importDefault(require("http-status"));
const config_1 = __importDefault(require("../../../config"));
const QueryBuilder_1 = __importDefault(require("../../builder/QueryBuilder"));
const AppError_1 = __importDefault(require("../../errors/AppError"));
const generateEmailVerificationLink_1 = require("../../errors/helpers/generateEmailVerificationLink");
const prisma_1 = __importDefault(require("../../utils/prisma"));
const sendMail_1 = __importDefault(require("../../utils/sendMail"));
const user_constant_1 = require("./user.constant");
// Function to get the keys of a model
function getModelKeys(modelName) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Dynamically access the model from the Prisma client
            const model = prisma_1.default[modelName]; // Type assertion to 'any'
            if (!model) {
                console.warn(`Model '${modelName}' not found on Prisma client.`);
                return [];
            }
            // Attempt to find the first record of the model
            const sampleRecord = yield model.findFirst();
            if (!sampleRecord) {
                console.warn(`No records found for model '${modelName}'. Ensure your database has at least one record to correctly retrieve model keys.`);
                return [];
            }
            // Extract the keys from the sample record object
            const keys = Object.keys(sampleRecord);
            return keys;
        }
        catch (error) {
            console.error(`Error getting model keys for '${modelName}':`, error);
            return [];
        }
        finally {
            yield prisma_1.default.$disconnect();
        }
    });
}
const registerUserIntoDB = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const hashedPassword = yield bcrypt.hash(payload.password, 12);
    const userData = Object.assign(Object.assign({}, payload), { password: hashedPassword });
    const newUser = yield prisma_1.default.user.create({
        data: Object.assign({}, userData),
    });
    yield resendUserVerificationEmail(newUser.email);
    const userWithOptionalPassword = newUser;
    delete userWithOptionalPassword.password;
    return userWithOptionalPassword;
});
const getAllUsersFromDB = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const keys = yield getModelKeys('user');
    const usersQuery = new QueryBuilder_1.default(prisma_1.default.user, query, keys);
    const result = yield usersQuery
        .search(['firstName', 'lastName', 'email'])
        .filter()
        .sort()
        .fields()
        .exclude()
        .paginate()
        .execute();
    const pagination = yield usersQuery.countTotal();
    return {
        meta: pagination,
        result,
    };
});
const getMyProfileFromDB = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const Profile = yield prisma_1.default.user.findUniqueOrThrow({
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
});
const getUserDetailsFromDB = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield prisma_1.default.user.findUniqueOrThrow({
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
});
const updateMyProfileIntoDB = (id, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const userProfileData = payload.Profile;
    delete payload.Profile;
    const userData = payload;
    // update user data
    yield prisma_1.default.$transaction((transactionClient) => __awaiter(void 0, void 0, void 0, function* () {
        // Update user data
        const updatedUser = yield transactionClient.user.update({
            where: { id },
            data: userData,
        });
        // Update user profile data
        const updatedUserProfile = yield transactionClient.Profile.update({
            where: { userId: id },
            data: userProfileData,
        });
        return { updatedUser, updatedUserProfile };
    }));
    // Fetch and return the updated user including the profile
    const updatedUser = yield prisma_1.default.user.findUniqueOrThrow({
        where: { id },
    });
    const userWithOptionalPassword = updatedUser;
    delete userWithOptionalPassword.password;
    return userWithOptionalPassword;
});
const updateUserRoleStatusIntoDB = (id, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield prisma_1.default.user.update({
        where: {
            id: id,
        },
        data: payload,
    });
    return result;
});
const changePassword = (user, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const userData = yield prisma_1.default.user.findUniqueOrThrow({
        where: {
            email: user.email,
            status: 'ACTIVE',
        },
    });
    const isCorrectPassword = yield bcrypt.compare(payload.oldPassword, userData.password);
    if (!isCorrectPassword) {
        throw new Error('Password incorrect!');
    }
    const hashedPassword = yield bcrypt.hash(payload.newPassword, 12);
    yield prisma_1.default.user.update({
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
});
const resendUserVerificationEmail = (email) => __awaiter(void 0, void 0, void 0, function* () {
    const [emailVerificationLink, hashedToken] = generateEmailVerificationLink_1.verification.generateEmailVerificationLink();
    const user = yield prisma_1.default.user.update({
        where: { email: email },
        data: {
            emailVerificationToken: hashedToken,
            emailVerificationTokenExpires: new Date(Date.now() + 3600 * 1000),
        },
    });
    const emailSender = new sendMail_1.default(user);
    yield emailSender.sendEmailVerificationLink('Email verification link', emailVerificationLink);
    return user;
});
const verifyUserEmail = (res, token) => __awaiter(void 0, void 0, void 0, function* () {
    const hashedToken = generateEmailVerificationLink_1.verification.generateHashedToken(token);
    const user = yield prisma_1.default.user.findFirst({
        where: {
            emailVerificationToken: hashedToken,
        },
    });
    if (!user) {
        // throw new AppError(
        //   httpStatus.BAD_REQUEST,
        //   'Invalid email verification token.',
        // );
        res.send((0, user_constant_1.failedEmailVerificationHTML)(config_1.default.base_url_client));
        return;
    }
    if (user &&
        user.emailVerificationTokenExpires &&
        user.emailVerificationTokenExpires < new Date(Date.now())) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Email verification token has expired. Please try resending the verification email again.');
    }
    const updatedUser = yield prisma_1.default.user.update({
        where: { id: user.id },
        data: {
            isEmailVerified: true,
            emailVerificationToken: null,
            emailVerificationTokenExpires: null,
        },
    });
    if (updatedUser.isEmailVerified) {
        res.send((0, user_constant_1.successEmailVerificationHTML)());
        return updatedUser;
    }
    return updatedUser;
});
exports.UserServices = {
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
