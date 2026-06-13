export default {
  requireModule: ['tsx'],
  require: ['tests/support/**/*.ts', 'tests/steps/**/*.ts'],
  paths: ['tests/features/**/*.feature'],
  format: ['progress', 'html:tests/reports/cucumber-report.html'],
  forceExit: true,
}
