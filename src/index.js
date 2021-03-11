require('colors');
const { SHOW_ONLY_ERRORS } = require('./config');
const {
  readJsonFile,
  pad,
  resolveRef,
  getRefName,
  replaceRefs,
  validateFragment,
  multiSchemaTypes,
  inferType,
} = require('./util');

const { DEBUG } = process.env;
const [schemaPath, instancePath] = process.argv.slice(2);

let errorList = [];
let multiSchemaErrors = [];  // TODO: Collate errors for multi-schemas, but supress if one matches

/**
 * Validate an array of schemas, such as allOf/anyOf/oneOf
 * 
 * @param {string} path - Location of this sub-schema.
 * @param {number} level - Indentation level.
 * @param {object} schema - Top level schema including definitions.
 * @param {string} arr - Array of schemas.
 * @param {string} type - Array of schemas list type.
 * @param {string} keyName - Key name of the property being validated.
 * @param {object} instance - Instance fragment.
 */
const validateArrayOfSchemas = (path, level, schema, arr, type, keyName, instance) => {
  arr.forEach((sub, i, arr) => {
    console.log(`${pad(level)}[${keyName} ${type} ${i + 1} of ${arr.length}]`.grey.bold);
    validatePropertySchema(path, level + 1, schema, sub, keyName, instance);
  });
};

/**
 * Validate a sub-schema.
 * 
 * @param {string} path - Location of this sub-schema.
 * @param {number} level - Indentation level.
 * @param {object} schema - Top level schema including definitions.
 * @param {object} subSchema - Schema fragment.
 * @param {string} keyName - Key name of the property being validated.
 * @param {object} instance - Instance fragment.
 */
const validatePropertySchema = (path, level, schema, subSchema, keyName, instance) => {
  // Schema is just a $ref
  if (subSchema.$ref) {
    const resolvedSubSchema = resolveRef(schema, subSchema.$ref);
    const refName = getRefName(subSchema.$ref);
    validatePropertySchema(path, level, schema, resolvedSubSchema, refName, instance);
    return;
  }

  // No type in this schema fragment, attempt to infer
  if (!subSchema.type) {
    subSchema.type = inferType(level, subSchema);
  }

  const { required = [], properties, type, items } = subSchema;
  if (DEBUG) console.log(JSON.stringify({ subSchema, instance }, null, 2));

  // Array of items with $ref
  if (items && items.$ref) {
    const refName = getRefName(subSchema.items.$ref);
    subSchema.items = resolveRef(schema, subSchema.items.$ref);

    validatePropertySchema(path, level, schema, subSchema.items, refName, instance);
    return;
  }

  // Array of items with anyOf/allOf/oneOf
  // TODO: Collate errors inside and add a flag to show them
  if (Array.isArray(instance) && items && multiSchemaTypes.some(type => items[type])) {
    multiSchemaTypes
      .filter(p => items[p])
      .forEach((listType) => {
        // Validate each item in array against a given array schema
        instance.forEach((p) => {
          validateArrayOfSchemas(path, level, schema, items[listType], listType, keyName, p);
        });
      });
    return;
  }

  // anyOf/allOf/oneOf
  if (multiSchemaTypes.some(type => subSchema[type])) {
    multiSchemaTypes
      .filter(p => subSchema[p])
      .forEach((listType) => {
        validateArrayOfSchemas(path, level, schema, subSchema[listType], listType, keyName, instance);
      });
    return;
  }

  // Array of basic fields
  if (Array.isArray(instance) && type === 'array') {
    instance.forEach((item, i) => {
      let arraySchema = items;
      // Array type, but no schema for the items - assume
      if (!items) {
        console.log(`${pad(level)}! Schema type 'array' does not specify schema for 'items'`);
        arraySchema = { type: 'any' };
      }
      validatePropertySchema(`${path}[${i}]`, level, schema, arraySchema, `${keyName}[${i}]`, item);
    });
    return;
  }

  // Basic field
  if (!properties && type) {
    let output;

    const errorMessage = validateFragment(subSchema, instance) || '';
    if (errorMessage) {
      output = `${pad(level)}✕ ${path}`.red + ` - ${errorMessage}`;
      errorList.push(output);
    } else {
      if (SHOW_ONLY_ERRORS) return;

      output = `${pad(level)}✓ ${path}`.green;
    }

    console.log(output);
    return;
  }

  // Sub-schemas exist
  if (properties) {
    Object
      .entries(properties)
      .forEach(([propName, propertySchema]) => {
        const subKeyPath = `${path}.${propName}`;
        // Property is absent, but was required
        if (required.includes(propName) && !instance[propName]) {
          const output = `${pad(level)}✕ ${subKeyPath}`.red + ' - required property is missing';
          errorList.push(output);
          console.log(output);
          return;
        }

        // Not required, allow absence
        if (!instance[propName]) {
          if (SHOW_ONLY_ERRORS) return;

          console.log(`${pad(level)}? ${subKeyPath} (omitted, not required)`.grey);
          return;
        }

        // Resolve $refs
        propertySchema = replaceRefs(propertySchema, schema);

        // Recurse
        const subInstance = instance[propName];
        validatePropertySchema(subKeyPath, level, schema, propertySchema, propName, subInstance);
      });
    return;
  }

  throw new Error(`Unhandled schema:\n${JSON.stringify({ subSchema, instance }, null, 2)}`);
};

/**
 * Main validation function.
 * 
 * @param {object} schema - Schema to test.
 * @param {object} instance - Instance to test.
 * @returns {Array<string>} List of errors.
 */
const validateSchema = (schema, instance) => {
  if (typeof schema !== 'object' || typeof instance !== 'object') {
    throw new Error('Schema or instance was not a valid object');
  }

  // Handle top-level allOf/anyOf/oneOf
  schema = replaceRefs(schema, schema);

  errorList = [];
  validatePropertySchema('', 1, schema, schema, '/', instance);
  return errorList;
};

/**
 * The main function.
 */
const main = () => {
  if (!schemaPath) throw new Error('Schema path not specified');
  if (!instancePath) throw new Error('Instance path not specified');

  const schema = readJsonFile(schemaPath);
  const instance = readJsonFile(instancePath);

  console.log();
  validateSchema(schema, instance);
  console.log(`\n${errorList.length} errors found.`);

  const overallError = validateFragment(schema, instance);
  if (!overallError) {
    console.log(`\nOverall, the data was valid\n`.green);
  } else {
    console.log(`\nOverall, the data was NOT valid\n`.red);
  }
};

module.exports = {
  validateSchema,
  main,
};
