import '../../../.pikku/function/pikku-functions.gen.js'
import {
  Before,
  After,
  BeforeAll,
  AfterAll,
  Given,
  When,
  Then,
  setDefaultTimeout,
} from '@cucumber/cucumber'
import { registerHooks, registerCommonSteps } from '@pikku/cucumber'
import { db } from './services.js'

registerHooks({ Before, After, BeforeAll, AfterAll, setDefaultTimeout }, db)
registerCommonSteps({ Given, When, Then })
