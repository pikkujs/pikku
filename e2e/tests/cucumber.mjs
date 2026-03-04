export default {
  requireModule: ['tsx'],
  require: ['tests/support/**/*.ts', 'tests/steps/**/*.ts'],
  paths: ['tests/features/**/*.feature'],
  format: ['progress-bar', 'html:tests/reports/cucumber-report.html'],
}
