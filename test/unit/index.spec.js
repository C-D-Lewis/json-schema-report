const { expect } = require('chai');

const { validateSchema } = require('../../src/index');

const simpleSchema = require('../data/simple.schema.json');
const complexSchema = require('../data/complex.schema.json');
const anyOfSchema = require('../data/anyOf.schema.json');
const allOfSchema = require('../data/allOf.schema.json');
const arrayWithRefsSchema = require('../data/arrayWithRefs.schema.json');

describe('unit tests', () => {
  it('should validate a simple schema', () => {
    const data = {
      name: 'Chris',
      age: 23,
      address: {
        line1: '10 The Street',
        line2: 'Exampleville',
        city: 'Lego City',
        state: 'CA',
        country: 'USA',
      },
    };

    const errors = validateSchema(simpleSchema, data);
    expect(errors).to.deep.equal([]);
  });

  it('should reject a simple schema', () => {
    const data = {
      name: 'Chris',
      age: -1,
      address: {
        line1: '10 The Street',
        line2: 'Exampleville',
        city: 'Lego City',
        state: 'CA',
        country: 'USA',
      },
    };

    const errors = validateSchema(simpleSchema, data);
    expect(errors).to.deep.equal([
      '  ✕ .age\n    - instance must be greater than or equal to 0',
    ]);
  });

  it('should handle missing required properties', () => {
    const data = {
      name: 'Chris',
      age: 23,
      address: {
        line1: '10 The Street',
        line2: 'Exampleville',
        city: 'Lego City',
        country: 'USA',
      },
    };

    const errors = validateSchema(simpleSchema, data);
    expect(errors).to.deep.equal([
      '  ? .address.state\n    - required property is missing',
    ]);
  });

  it('should silently handle missing optional properties', () => {
    const data = {
      name: 'Chris',
      address: {
        line1: '10 The Street',
        line2: 'Exampleville',
        city: 'Lego City',
        state: 'CA',
        country: 'USA',
      },
    };

    const errors = validateSchema(simpleSchema, data);
    expect(errors).to.deep.equal([]);
  });

  it('should handle invalid JSON data', () => {
    const data = 42;

    expect(() => validateSchema(simpleSchema, data)).to.throw();
  });

  it('should handle $ref and definitions', () => {
    const data = {
      name: 'Chris',
      age: 23,
      address: {
        line1: '10 The Street',
        line2: 'Exampleville',
        city: 'Lego City',
        state: 'CA',
        country: 'USA',
      },
    };

    const errors = validateSchema(complexSchema, data);
    expect(errors).to.deep.equal([]);
  });

  it('should handle anyOf', () => {
    const data = {
      name: 'King of the Seas',
      age: 12,
      details: {
        color: 'red',
        length: 23,
        topSpeed: 12,
      },
    };

    const errors = validateSchema(anyOfSchema, data);
    expect(errors).to.deep.equal([
      // Missing from [anyOf 1/2]
      '    ? .details.numWheels\n      - required property is missing',
    ]);
  });

  it('should reject invalid data for sub-schema anyOf', () => {
    const data = {
      name: 'King of the Seas',
      age: 12,
      details: {
        length: 23,
        topSpeed: 12,
      },
    };

    const errors = validateSchema(anyOfSchema, data);

    // TODO: Further resolve for better detail
    expect(errors).to.deep.equal([
      // Missing from [anyOf 1/2]
      '    ? .details.color\n      - required property is missing',
      '    ? .details.numWheels\n      - required property is missing',
      // Missing from [anyOf 2/2]
      '    ? .details.color\n      - required property is missing',
    ]);
  });

  it('should handle top-level allOf', () => {
    const data = {
      name: 'King of the Seas',
      age: 12,
      color: 'red',
      length: 23,
      topSpeed: 12,
    };

    const errors = validateSchema(allOfSchema, data);
    expect(errors).to.deep.equal([]);
  });

  it('should reject invalid data for top-level allOf', () => {
    const data = {
      name: 'King of the Seas',
      age: 12,
      length: 23,
      topSpeed: 12,
    };

    const errors = validateSchema(allOfSchema, data);
    expect(errors).to.deep.equal([
      "  ? .color\n    - required property is missing"
    ]);
  });

  it('should handle top-level oneOf', () => {
    // TODO: oneOf pets test schema
  });

  it('should handle an array of items with $ref', () => {
    const data = {
      name: 'Person 1',
      age: 12,
      clothes: [{
        color: 'red',
        size: 'medium',
      }],
    };

    const errors = validateSchema(arrayWithRefsSchema, data);
    expect(errors).to.deep.equal([]);
  });

  it('should reject invalid data for an array of items with $ref', () => {
    const data = {
      name: 'Person 1',
      age: 12,
      clothes: [{
        color: 'red',
        type: 'cotton',
      }],
    };

    const errors = validateSchema(arrayWithRefsSchema, data);
    expect(errors).to.deep.equal([
      '  ✕ .clothes\n    - instance[0] requires property \"size\"',
    ]);
  });

  it('should handle a missing definition');

  it('should handle an invalid JSON schema');
});
