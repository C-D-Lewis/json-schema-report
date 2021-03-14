require('colors');
const { SHOW_ONLY_ERRORS, SHOW_DECISIONS, HIDE_OPTIONAL_VALID } = require('./config');
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
let topLevelSchema;
let multiSchemaErrors = [];  // TODO: Collate errors for multi-schemas, but supress if one matches

/**
 * Validate an array of schemas, such as allOf/anyOf/oneOf
 * 
 * @param {string} path - Location of this sub-schema.
 * @param {number} level - Indentation level.
 * @param {string} arr - Array of schemas.
 * @param {string} type - Array of schemas list type.
 * @param {string} keyName - Key name of the property being validated.
 * @param {object} instance - Instance fragment.
 */
const validateArrayOfSchemas = (path, level, arr, type, keyName, instance) => {
  arr.forEach((sub, i, arr) => {
    console.log(`${pad(level)}[${keyName} ${type} ${i + 1} of ${arr.length}]`.grey.bold);
    validatePropertySchema(path, level + 1, sub, keyName, instance);
  });
};

/**
 * Validate a sub-schema.
 * 
 * @param {string} path - Location of this sub-schema.
 * @param {number} level - Indentation level.
 * @param {object} subSchema - Schema fragment.
 * @param {string} keyName - Key name of the property being validated.
 * @param {object} instance - Instance fragment.
 */
const validatePropertySchema = (path, level, subSchema, keyName, instance) => {
  // Schema is just a $ref
  if (subSchema.$ref) {
    if (SHOW_DECISIONS) console.log(`${pad(level)}mode: $ref`.grey);

    const resolvedSubSchema = resolveRef(topLevelSchema, subSchema.$ref);
    const refName = getRefName(subSchema.$ref);
    validatePropertySchema(path, level, resolvedSubSchema, refName, instance);
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
    if (SHOW_DECISIONS) console.log(`${pad(level)}mode: items.$ref`.grey);

    const refName = getRefName(subSchema.items.$ref);
    subSchema.items = resolveRef(topLevelSchema, subSchema.items.$ref);

    // Validate each item in array against a given array schema
    instance.forEach((p, i) => {
      validatePropertySchema(path, level, subSchema.items, `${keyName}[${i}]`, p);
    });
    return;
  }

  // Array of items with anyOf/allOf/oneOf
  // TODO: Collate errors inside and add a flag to show them
  if (Array.isArray(instance) && items && multiSchemaTypes.some(type => items[type])) {
    if (SHOW_DECISIONS) console.log(`${pad(level)}mode: items.allOf/anyOf/oneOf`.grey);

    multiSchemaTypes
      .filter(p => items[p])
      .forEach((listType) => {
        // Validate each item in array against a given array schema
        instance.forEach((p) => {
          validateArrayOfSchemas(path, level, items[listType], listType, keyName, p);
        });
      });
    return;
  }

  // anyOf/allOf/oneOf
  if (multiSchemaTypes.some(type => subSchema[type])) {
    if (SHOW_DECISIONS) console.log(`${pad(level)}mode: allOf/anyOf/oneOf`.grey);

    multiSchemaTypes
      .filter(p => subSchema[p])
      .forEach((listType) => {
        validateArrayOfSchemas(path, level, subSchema[listType], listType, keyName, instance);
      });
    return;
  }

  // Array of basic fields
  if (Array.isArray(instance) && type === 'array') {
    if (SHOW_DECISIONS) console.log(`${pad(level)}mode: type: array`.grey);

    instance.forEach((item, i) => {
      let arraySchema = items;
      // Array type, but no schema for the items - assume
      if (!items) {
        console.log(`${pad(level)}! Schema type 'array' does not specify schema for 'items'`);
        arraySchema = { type: 'any' };
      }
      validatePropertySchema(`${path}[${i}]`, level, arraySchema, `${keyName}[${i}]`, item);
    });
    return;
  }

  // Basic field
  if (!properties && type) {
    if (SHOW_DECISIONS) console.log(`${pad(level)}mode: basic type`.grey);

    // Array basic type are all validated separately, but the index is in keyName
    // Add the index of the item if it's not already in the path
    const suffix = keyName.includes('[') && !path.includes('[') ? keyName.slice(keyName.indexOf('[')) : '';

    let output;
    const errorMessage = validateFragment(subSchema, instance) || '';
    if (errorMessage) {
      output = `${pad(level)}✕ ${path}${suffix}`.red + ` - ${errorMessage}`;
      errorList.push(output);
    } else {
      if (SHOW_ONLY_ERRORS) return;

      output = `${pad(level)}✓ ${path}${suffix}`.green;
    }

    console.log(output);
    return;
  }

  // Sub-schemas exist
  if (properties) {
    if (SHOW_DECISIONS) console.log(`${pad(level)}mode: properties`.grey);

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
          if (SHOW_ONLY_ERRORS || HIDE_OPTIONAL_VALID) return;

          console.log(`${pad(level)}? ${subKeyPath} (omitted, not required)`.grey);
          return;
        }

        // Resolve $refs
        propertySchema = replaceRefs(propertySchema, topLevelSchema);

        // Recurse
        const subInstance = instance[propName];
        validatePropertySchema(subKeyPath, level, propertySchema, propName, subInstance);
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

  // For both cli and tests, use the schema passed here
  topLevelSchema = { ...schema };

  // Handle top-level allOf/anyOf/oneOf
  schema = replaceRefs(schema, topLevelSchema);

  errorList = [];
  validatePropertySchema('', 1, schema, '/', instance);
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
