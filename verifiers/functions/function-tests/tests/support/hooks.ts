import '../../../.pikku/pikku-bootstrap.gen.js'
import {
  Before,
  After,
  BeforeAll,
  AfterAll,
  setDefaultTimeout,
  Given,
  When,
  Then,
} from '@cucumber/cucumber'
import { registerHooks, registerCommonSteps } from '@pikku/cucumber'
import { db } from './services.js'

registerHooks({ Before, After, BeforeAll, AfterAll, setDefaultTimeout }, db)
registerCommonSteps({ Given, When, Then })
