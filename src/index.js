const { should } = require('chai');
const { readFileSync } = require('fs');
const { validate } = require('jsonschema');

const [schemaPath, instancePath] = process.argv.slice(2);

const multiSchemaTypes = ['anyOf', 'allOf', 'oneOf'];
let errorList = [];

/**
 * Read a JSON file.
 *
 * @param {string} path - Input file path.
 * @returns {object}
 */
const readJsonFile = path => JSON.parse(readFileSync(path, 'utf8'));

/**
 * Produce a padding.
 *
 * @param {number} level - Number of levels indented.
 */
const pad = level => '  '.repeat(level);

/**
 * Validate a schema fragment with an instance fragment.
 * 
 * @param {object} schema - Schema fragment.
 * @param {object} instance - Instance fragment.
 * @returns {string} First error stack.
 */
const validateFragment = (schema, instance) => {
  const { errors } = validate(instance, schema);
  return errors.length ? errors[0].stack : undefined;
};

/**
 * Resolve a definition from $ref string.
 * 
 * @param {object} schema - Top level schema containing definitions.
 * @param {string} $ref - Ref string.
 * @returns {object} Resolved definition.
 */
const resolveRef = (schema, $ref) => {
  const refName = $ref.split('/').pop();
  const definition = schema.definitions && schema.definitions[refName];
  if (!definition) throw new Error(`Definition ${refName} not found`);
  
  return definition;
};

/**
 * Replace all $ref and allOf/anyOf/oneOf lists containing $ref with those
 * referred to definitions.
 * 
 * @param {object} propertySchema - Single property schema.
 * @param {*} schema - Top-level schema containing definitions.
 * @returns {void}
 */
const replaceRefs = (propertySchema, schema) => {
  const { $ref, items } = propertySchema;

  // Handle single $ref object
  if ($ref) return resolveRef(schema, $ref);

  // Handle arrays
  if (items && items.$ref) {
    propertySchema.items = resolveRef(schema, items.$ref);
    return propertySchema;
  }

  // Handle lists of objects
  const updated = { ...propertySchema };
  multiSchemaTypes
    .filter(p => propertySchema[p])
    .forEach((listType) => {
      propertySchema[listType].forEach((item, i) => {
        if (!item.$ref) return;

        // Replace list item with definition
        updated[listType][i] = resolveRef(schema, item.$ref);
      });
    });
  return updated;
};

/**
 * Validate an array of schemas, such as allOf/anyOf/oneOf
 * 
 * @param {string} path - Location of this sub-schema.
 * @param {number} level - Indentation level.
 * @param {object} schema - Top level schema including definitions.
 * @param {string} arr - Array of schemas.
 * @param {string} type - Array of schemas list type.
 * @param {object} instance - Instance fragment.
 */
const validateArrayOfSchemas = (path, level, schema, arr, type, instance) => {
  arr.forEach((sub, i, arr) => {
    console.log(`${pad(level)}[${type} ${i + 1}/${arr.length}]`);
    validatePropertySchema(path, level + 1, schema, sub, instance);
  });
};

/**
 * Validate a sub-schema.
 * 
 * @param {string} path - Location of this sub-schema.
 * @param {number} level - Indentation level.
 * @param {object} schema - Top level schema including definitions.
 * @param {object} subSchema - Schema fragment.
 * @param {object} instance - Instance fragment.
 */
const validatePropertySchema = (path, level, schema, subSchema, instance) => {
  // Schema is just a $ref
  if (subSchema.$ref) {
    const resolvedSubSchema = resolveRef(schema, subSchema.$ref);
    validatePropertySchema(path, level, schema, resolvedSubSchema, instance);
    return;
  }

  const { required = [], properties, type, items } = subSchema;

  // Array of items with $ref
  if (items && items.$ref) {
    subSchema.items = resolveRef(schema, subSchema.items.$ref);

    validatePropertySchema(path, level, schema, subSchema.items, instance);
    return;
  }

  // Array of items with anyOf/allOf/oneOf
  // TODO: Collate errors inside and add a flag to show them
  if (items && multiSchemaTypes.some(type => items[type])) {
    multiSchemaTypes
      .filter(p => items[p])
      .forEach((listType) => {
        // Validate each item in array against a given array schema
        instance.forEach((p) => {
          validateArrayOfSchemas(path, level, schema, items[listType], listType, p);
        });
      });
    return;
  }

  // anyOf/allOf/oneOf
  if (multiSchemaTypes.some(type => subSchema[type])) {
    multiSchemaTypes
      .filter(p => subSchema[p])
      .forEach((listType) => {
        validateArrayOfSchemas(path, level, schema, subSchema[listType], listType, instance);
      });
    return;
  }

  // Basic field
  if (!properties && type) {
    const errorMessage = validateFragment(subSchema, instance) || '';
    let output = `${pad(level)}${errorMessage ? '✕': '✓'} ${path}`;
    if (errorMessage) {
      output += ` ${errorMessage ? `- ${errorMessage}` : ''}`;
      errorList.push(output);
    }

    console.log(output);
    return;
  }

  // Sub-schemas exist
  if (properties) {
    Object
      .entries(properties)
      .forEach(([name, propertySchema]) => {
        const subKeyPath = `${path}.${name}`;
        // Property is absent, but was required
        if (required.includes(name) && !instance[name]) {
          const output = `${pad(level)}✕ ${subKeyPath} - required property is missing`;
          errorList.push(output);
          console.log(output);
          return;
        }

        // Not required, allow absence
        if (!instance[name]) {
          console.log(`${pad(level)}? ${subKeyPath}`);
          return;
        }

        // Resolve $refs
        propertySchema = replaceRefs(propertySchema, schema);

        // Recurse
        const subInstance = instance[name];
        validatePropertySchema(subKeyPath, level, schema, propertySchema, subInstance);
      });
    return;
  }

  throw new Error(`Not sure what to do: ${JSON.stringify(subSchema, null, 2)}`);
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
  validatePropertySchema('', 1, schema, schema, instance);
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
  console.log(`\n${errorList.length} errors found.\n`);
};

module.exports = {
  validateSchema,
  main,
};
