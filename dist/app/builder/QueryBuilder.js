"use strict";
// Query Builder in Prisma
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
const http_status_1 = __importDefault(require("http-status"));
const AppError_1 = __importDefault(require("../errors/AppError"));
class QueryBuilder {
    constructor(model, query, keys) {
        this.prismaQuery = {}; // Define as any for flexibility
        this.primaryKeyField = 'id'; // Default primary key field
        this.modelKeys = []; // Store model keys
        this.model = model;
        this.query = query;
        this.modelKeys = keys || [];
        // Ensure we always have at least the ID field
        if (!this.modelKeys.includes(this.primaryKeyField)) {
            this.modelKeys.push(this.primaryKeyField);
        }
    }
    // Search
    search(searchableFields) {
        const searchTerm = this.query.searchTerm;
        if (searchTerm) {
            this.prismaQuery.where = Object.assign(Object.assign({}, this.prismaQuery.where), { OR: searchableFields.map(field => ({
                    [field]: { contains: searchTerm, mode: 'insensitive' },
                })) });
        }
        return this;
    }
    // Filter
    filter() {
        const queryObj = Object.assign({}, this.query);
        const excludeFields = ['searchTerm', 'sort', 'limit', 'page', 'fields', 'exclude'];
        excludeFields.forEach(field => delete queryObj[field]);
        const formattedFilters = {};
        for (const [key, value] of Object.entries(queryObj)) {
            if (typeof value === 'object' && value !== null) {
                let operatorFilter = {};
                for (const [operator, val] of Object.entries(value)) {
                    const numericValue = parseFloat(val);
                    if (isNaN(numericValue)) {
                        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, `The value field in the ${operator} should be a number`);
                    }
                    operatorFilter[operator] = numericValue;
                }
                formattedFilters[key] = operatorFilter;
            }
            else {
                formattedFilters[key] = value;
            }
        }
        this.prismaQuery.where = Object.assign(Object.assign({}, this.prismaQuery.where), formattedFilters);
        return this;
    }
    // Sorting
    sort() {
        var _a;
        const sort = ((_a = this.query.sort) === null || _a === void 0 ? void 0 : _a.split(',')) || ['-createdAt'];
        const orderBy = sort.map(field => {
            if (field.startsWith('-')) {
                return { [field.slice(1)]: 'desc' };
            }
            return { [field]: 'asc' };
        });
        this.prismaQuery.orderBy = orderBy;
        return this;
    }
    // Pagination
    paginate() {
        const page = Number(this.query.page) || 1;
        const limit = Number(this.query.limit) || 10;
        const skip = (page - 1) * limit;
        this.prismaQuery.skip = skip;
        this.prismaQuery.take = limit;
        return this;
    }
    // Fields Selection
    fields() {
        const fieldsParam = this.query.fields;
        if (fieldsParam) {
            const fields = fieldsParam.split(',').filter(field => field.trim() !== '');
            if (fields.length > 0) {
                // Start with a completely empty select object
                this.prismaQuery.select = {};
                // Only include the specifically requested fields
                fields.forEach(field => {
                    const trimmedField = field.trim();
                    if (trimmedField.startsWith('-')) {
                        // If field starts with '-', it should be excluded
                        this.prismaQuery.select[trimmedField.slice(1)] = false;
                    }
                    else {
                        // Otherwise, include only this field
                        this.prismaQuery.select[trimmedField] = true;
                    }
                });
                // Double check: ensure at least one field is true
                const hasAtLeastOneTrueField = Object.values(this.prismaQuery.select).some(value => value === true);
                if (!hasAtLeastOneTrueField) {
                    // If all fields are false, set primary key field to true as a fallback
                    this.prismaQuery.select[this.primaryKeyField] = true;
                }
            }
        }
        return this;
    }
    // Exclude Fields
    exclude() {
        const excludeParam = this.query.exclude;
        if (excludeParam) {
            const excludeFields = excludeParam.split(',').filter(field => field.trim() !== '');
            if (excludeFields.length > 0) {
                // If select is not already defined, initialize it with all model keys set to true
                if (!this.prismaQuery.select) {
                    this.prismaQuery.select = {};
                    // Set all model keys to true by default
                    this.modelKeys.forEach(key => {
                        this.prismaQuery.select[key] = true;
                    });
                }
                else if (Object.keys(this.prismaQuery.select).length === 0) {
                    // If select exists but is empty, set all model keys to true
                    this.modelKeys.forEach(key => {
                        this.prismaQuery.select[key] = true;
                    });
                }
                // Set each excluded field to false
                excludeFields.forEach(field => {
                    const trimmedField = field.trim();
                    this.prismaQuery.select[trimmedField] = false;
                });
                // Ensure at least one field is true
                const hasAtLeastOneTrueField = Object.values(this.prismaQuery.select).some(value => value === true);
                if (!hasAtLeastOneTrueField) {
                    // If all fields are false, set primary key field to true as a fallback
                    this.prismaQuery.select[this.primaryKeyField] = true;
                }
            }
        }
        return this;
    }
    // Execute Query
    execute() {
        return __awaiter(this, void 0, void 0, function* () {
            // Ensure prismaQuery is properly structured
            if (this.prismaQuery.select) {
                // If select is empty, remove it entirely to return all fields
                if (Object.keys(this.prismaQuery.select).length === 0) {
                    delete this.prismaQuery.select;
                }
                // For fields parameter: Keep the select as is to return only requested fields
                if (this.query.fields) {
                    // For fields, we don't automatically add the ID field
                    // This allows users to get exactly the fields they requested
                    // However, we need at least one true field for Prisma to work
                    const hasAtLeastOneTrueField = Object.values(this.prismaQuery.select).some(value => value === true);
                    if (!hasAtLeastOneTrueField) {
                        // If all fields are false, set primary key field to true as a fallback
                        this.prismaQuery.select[this.primaryKeyField] = true;
                    }
                }
                // For exclude parameter: Keep the select as is to exclude specified fields
                else if (this.query.exclude) {
                    // Already handled in the exclude method
                }
                // For other cases: If all fields are included, remove select for efficiency
                else {
                    const allFieldsIncluded = Object.values(this.prismaQuery.select).every(value => value === true);
                    if (allFieldsIncluded) {
                        delete this.prismaQuery.select;
                    }
                }
            }
            // For debugging
            // console.log('Final query:', JSON.stringify(this.prismaQuery, null, 2));
            // Get the results from Prisma
            const results = yield this.model.findMany(this.prismaQuery);
            // If fields parameter is used, we need to post-process the results
            // to remove the ID field if it wasn't explicitly requested
            if (this.query.fields && results.length > 0) {
                const fieldsRequested = this.query.fields.split(',').map(f => f.trim());
                // If ID wasn't explicitly requested, remove it from the results
                if (!fieldsRequested.includes(this.primaryKeyField)) {
                    return results.map((item) => {
                        const newItem = Object.assign({}, item);
                        delete newItem[this.primaryKeyField];
                        return newItem;
                    });
                }
            }
            return results;
        });
    }
    // Count Total
    countTotal() {
        return __awaiter(this, void 0, void 0, function* () {
            const total = yield this.model.count({ where: this.prismaQuery.where });
            const page = Number(this.query.page) || 1;
            const limit = Number(this.query.limit) || 10;
            const totalPage = Math.ceil(total / limit);
            return {
                page,
                limit,
                total,
                totalPage,
            };
        });
    }
}
exports.default = QueryBuilder;
