import { World, setWorldConstructor } from '@cucumber/cucumber'
import { createFunctionWorld } from '@pikku/cucumber'
import { createStubServices } from './services.js'

createFunctionWorld(World, setWorldConstructor, createStubServices)
