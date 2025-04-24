import {
  PrismaClientKnownRequestError,
  PrismaClientUnknownRequestError,
  PrismaClientValidationError,
} from '@prisma/client/runtime/library';
import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import AppError from '../errors/AppError';
import handleZodError from '../errors/handleZodError';

const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  console.log(err);
  let statusCode = 500;
  let message = 'Something went wrong!';
  let errorDetails: Record<string, any> = {};

  if (err instanceof ZodError) {
    // Handle Zod error
    const simplifiedError = handleZodError(err);
    statusCode = simplifiedError?.statusCode || 400;
    message = simplifiedError?.message || 'Validation error';
    errorDetails = simplifiedError?.errorDetails || {};
  } else if (err?.code === 'P2002') {
    // Handle Prisma Duplicate entity error
    statusCode = 409;
    message = `Duplicate entity on the fields: ${err.meta?.target?.split('_')[1]}`;
    errorDetails = { code: err.code, target: err.meta?.target };
  } else if (err?.code === 'P2003') {
    // Handle Prisma Foreign Key constraint error
    statusCode = 400;
    message = `Foreign key constraint failed on the field: ${err.meta?.field_name}`;
    errorDetails = {
      code: err.code,
      field: err.meta?.field_name,
      model: err.meta?.modelName,
    };
  } else if (err?.code === 'P2011') {
    // Handle Prisma Null constraint violation error
    statusCode = 400;
    message = `Null constraint violation on the field: ${err.meta?.field_name}`;
    errorDetails = { code: err.code, field: err.meta?.field_name };
  } else if (err?.code === 'P2025') {
    // Handle Prisma Record not found error
    statusCode = 404;
    message = `Record not found: ${err.meta?.cause || 'No matching record found for the given criteria.'}`;
    errorDetails = { code: err.code, cause: err.meta?.cause };
  } else if (err instanceof PrismaClientValidationError) {
    // Handle Prisma Validation errors
    statusCode = 400;
    message = 'Validation error in Prisma operation';
    errorDetails = { message: err.message };
  } else if (err instanceof PrismaClientKnownRequestError) {
    // Handle specific Prisma known errors
    statusCode = 400;
    message = err.message;
    errorDetails = { code: err.code, meta: err.meta };
  } else if (err instanceof PrismaClientUnknownRequestError) {
    // Handle Prisma unknown errors
    statusCode = 500;
    message = err.message;
    errorDetails = err;
  } else if (err instanceof AppError) {
    // Handle custom AppError
    statusCode = err.statusCode;
    message = err.message;
    errorDetails = { stack: err.stack };
  } else if (err instanceof Error) {
    if (err.name === 'TokenExpiredError') {
      statusCode = 401;
      message = 'Expired token';
      errorDetails = { stack: err.stack };
    }
  } else if (err instanceof Error) {
    // Handle generic Error
    message = err.message;
    errorDetails = { err, stack: err.stack };
  }

  res.status(statusCode).json({
    success: false,
    message,
    errorDetails,
  });
};

export default globalErrorHandler;
