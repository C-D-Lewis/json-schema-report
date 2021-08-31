const args = process.argv.slice(2);

const config = {
  HELP: ['-h', '--help'].some(p => args.includes(p)),
  HIDE_OPTIONAL_VALID: args.includes('-o'),
  VERBOSE: args.includes('-v'),
};

module.exports = config;
