// Query Builder in Prisma

import httpStatus from 'http-status';
import AppError from '../errors/AppError';

class QueryBuilder {
  private model: any;
  private query: Record<string, unknown>;
  private prismaQuery: any = {}; // Define as any for flexibility
  private primaryKeyField: string = 'id'; // Default primary key field
  private modelKeys: string[] = []; // Store model keys

  constructor(model: any, query: Record<string, unknown>, keys: string[]) {
    this.model = model;
    this.query = query;
    this.modelKeys = keys || [];
    
    // Ensure we always have at least the ID field
    if (!this.modelKeys.includes(this.primaryKeyField)) {
      this.modelKeys.push(this.primaryKeyField);
    }
  }

  // Search
  search(searchableFields: string[]) {
    const searchTerm = this.query.searchTerm as string;
    if (searchTerm) {
      this.prismaQuery.where = {
        ...this.prismaQuery.where,
        OR: searchableFields.map(field => ({
          [field]: { contains: searchTerm, mode: 'insensitive' },
        })),
      };
    }
    return this;
  }

  // Filter
  filter() {
    const queryObj = { ...this.query };
    const excludeFields = ['searchTerm', 'sort', 'limit', 'page', 'fields', 'exclude'];
    excludeFields.forEach(field => delete queryObj[field]);

    const formattedFilters: Record<string, any> = {};
    for (const [key, value] of Object.entries(queryObj)) {
      if (typeof value === 'object' && value !== null) {
        let operatorFilter: Record<string, number> = {};
        for (const [operator, val] of Object.entries(value)) {
          const numericValue = parseFloat(val);
          if (isNaN(numericValue)) {
            throw new AppError(
              httpStatus.BAD_REQUEST,
              `The value field in the ${operator} should be a number`,
            );
          }
          operatorFilter[operator] = numericValue;
        }
        formattedFilters[key] = operatorFilter;
      } else {
        formattedFilters[key] = value;
      }
    }

    this.prismaQuery.where = {
      ...this.prismaQuery.where,
      ...formattedFilters,
    };

    return this;
  }

  // Sorting
  sort() {
    const sort = (this.query.sort as string)?.split(',') || ['-createdAt'];
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
    const fieldsParam = this.query.fields as string;
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
          } else {
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
    const excludeParam = this.query.exclude as string;
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
        } else if (Object.keys(this.prismaQuery.select).length === 0) {
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
  async execute() {
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
    const results = await this.model.findMany(this.prismaQuery);
    
    // If fields parameter is used, we need to post-process the results
    // to remove the ID field if it wasn't explicitly requested
    if (this.query.fields && results.length > 0) {
      const fieldsRequested = (this.query.fields as string).split(',').map(f => f.trim());
      
      // If ID wasn't explicitly requested, remove it from the results
      if (!fieldsRequested.includes(this.primaryKeyField)) {
        return results.map((item: Record<string, any>) => {
          const newItem: Record<string, any> = {...item};
          delete newItem[this.primaryKeyField];
          return newItem;
        });
      }
    }
    
    return results;
  }

  // Count Total
  async countTotal() {
    const total = await this.model.count({ where: this.prismaQuery.where });
    const page = Number(this.query.page) || 1;
    const limit = Number(this.query.limit) || 10;
    const totalPage = Math.ceil(total / limit);

    return {
      page,
      limit,
      total,
      totalPage,
    };
  }
}

export default QueryBuilder;
