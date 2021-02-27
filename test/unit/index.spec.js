const { expect } = require('chai');

const { validateSchema } = require('../../src/index');

const simpleSchema = require('../data/simpleSchema.schema.json');
const complexSchema = require('../data/complexSchema.schema.json');
const anyOfSchema = require('../data/anyOfSchema.schema.json');
const allOfSchema = require('../data/allOfSchema.schema.json');

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
    expect(errors).to.deep.equal([]);
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

  it('should handle oneOf');

  it('should handle a missing definition');

  it('should handle an invalid JSON schema');
});
