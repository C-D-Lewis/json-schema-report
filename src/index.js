const { should } = require('chai');
const { readFileSync } = require('fs');
const { validate } = require('jsonschema');

const [schemaPath, instancePath] = process.argv.slice(2);

let errors = [];

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
  const { $ref } = propertySchema;

  // Handle single $ref object
  if ($ref) return resolveRef(schema, $ref);

  // Handle list of objects
  const updated = { ...propertySchema };
  ['anyOf', 'allOf', 'oneOf']
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
 * Validate a sub-schema.
 * 
 * @param {string} path - Location of this sub-schema.
 * @param {object} subSchema - Schema fragment.
 * @param {object} instance - Instance fragment.
 */
const validatePropertySchema = (path, level, schema, subSchema, instance) => {
  const { required, properties } = subSchema;

  // allOf/anyOf/oneOf
  // ['anyOf', 'allOf', 'oneOf']
  //   .filter(p => propertySchema[p])
  //   .forEach((listType) => {

  //   });

  // Basic field
  if (!properties) {
    const errorMessage = validateFragment(subSchema, instance) || '';
    let output = `${pad(level + 1)}${errorMessage ? '✕': '✓'} ${path}`;
    if (errorMessage) {
      output += `\n${pad(level + 2)}${errorMessage ? `- ${errorMessage}` : ''}`;
      errors.push(output);
    }

    console.log(output);
    return;
  }

  // Sub-schemas exist
  Object
    .entries(properties)
    .forEach(([name, propertySchema]) => {
      const subKeyPath = `${path}.${name}`;
      // Property is absent, but was required
      if (required.includes(name) && !instance[name]) {
        const output = `${pad(level + 1)}? ${subKeyPath}\n${pad(level + 2)}- required property is missing`;
        errors.push(output);
        console.log(output);
        return;
      }

      // Not required, allow absence
      if (!instance[name]) {
        console.log(`${pad(level + 1)}  (${subKeyPath})`);
        return;
      }

      // Resolve $refs
      propertySchema = replaceRefs(propertySchema, schema);

      // Recurse
      const subInstance = instance[name];
      validatePropertySchema(subKeyPath, level, schema, propertySchema, subInstance);
    });
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

  errors = [];
  validatePropertySchema('', 0, schema, schema, instance);
  return errors;
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
  console.log(`\n${errors.length} errors found.\n`);
};

module.exports = {
  validateSchema,
  main,
};
