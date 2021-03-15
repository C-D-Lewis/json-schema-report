const args = process.argv.slice(2);

const config = {
  HIDE_OPTIONAL_VALID: args.includes('-o'),
  VERBOSE: args.includes('-v'),
};

module.exports = config;
