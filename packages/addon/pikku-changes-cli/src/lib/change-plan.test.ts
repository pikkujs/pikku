import { describe, test } from 'node:test'
import assert from 'node:assert'
import { filingOrder, planProblems, validatePlan } from './change-plan.js'

/**
 * A recipe box: the data first, then a screen and a function that both wait
 * on it and not on each other.
 */
const recipeBox = () => [
  {
    ref: 'data',
    title: 'Recipes and their ingredients are kept',
    body: 'Store recipes with a title, steps and ingredients. Declare listRecipes (no input, output: recipes) and saveRecipe (input: recipe, output: recipe) with mock: true and a few .mocks records. Done when you can list the mocked recipes.',
    specialist: 'build',
    dependsOn: [],
  },
  {
    ref: 'list',
    title: 'The recipe list',
    body: 'A page listing every recipe by title with its ingredients count. Done when you can open /recipes and see each recipe.',
    specialist: 'frontend',
    dependsOn: ['data'],
  },
  {
    ref: 'save',
    title: 'Saving a recipe for real',
    body: 'Build saveRecipe and listRecipes against the database. Done when a saved recipe is still there after a reload.',
    specialist: 'build',
    dependsOn: ['data'],
  },
]

const problemsOf = (plan: unknown) => planProblems(plan).problems

describe('a change plan', () => {
  test('a well-formed plan has no problems', () => {
    assert.deepStrictEqual(problemsOf(recipeBox()), [])
  })

  test('not an array is refused with the shape to use', () => {
    assert.match(problemsOf({ changes: [] })[0]!, /JSON array of changes/)
  })

  test('a missing or unknown specialist names the choices', () => {
    const plan = recipeBox() as any[]
    delete plan[1].specialist
    plan[2].specialist = 'backend'
    const problems = problemsOf(plan)
    assert.match(
      problems[0]!,
      /change 2 \("list"\): "specialist" must be one of build, frontend/
    )
    assert.match(problems[1]!, /change 3 \("save"\): "specialist"/)
  })

  test('a questions field is refused, pointing at Decision:', () => {
    const plan = recipeBox() as any[]
    plan[1].ask = 'Which colour?'
    assert.match(problemsOf(plan)[0]!, /remove "ask".*Decision: \.\.\./)
  })

  test('an unknown ref in dependsOn lists the refs there are', () => {
    const plan = recipeBox()
    plan[2]!.dependsOn = ['data', 'recipes']
    assert.match(
      problemsOf(plan)[0]!,
      /change 3 \("save"\): dependsOn names "recipes".*Refs are: data, list, save/
    )
  })

  test('a duplicate ref is refused', () => {
    const plan = recipeBox()
    plan[2]!.ref = 'list'
    plan[2]!.dependsOn = ['data']
    assert.match(problemsOf(plan)[0]!, /ref "list" is already used by change 2/)
  })

  test('a body shorter than a sentence is refused', () => {
    const plan = recipeBox()
    plan[1]!.body = 'Recipe list page.'
    assert.match(problemsOf(plan)[0]!, /shorter than a sentence/)
  })

  test('a body with no outcome sentence names the phrases to use', () => {
    const plan = recipeBox()
    plan[1]!.body =
      'A page listing every recipe by title with its ingredient count.'
    assert.match(problemsOf(plan)[0]!, /"done when", "you can"/)
  })

  test('a cycle is named', () => {
    const plan = recipeBox()
    plan[1]!.dependsOn = ['data', 'save']
    plan[2]!.dependsOn = ['data', 'list']
    assert.match(
      problemsOf(plan)[0]!,
      /cycle: (list → save → list|save → list → save)/
    )
  })

  test('the data change must come first when every change waits on it', () => {
    const [data, list, save] = recipeBox()
    const problems = problemsOf([list, data, save])
    assert.ok(
      problems.some((p) =>
        /"data" is the change every other change depends on.*move it to the start/.test(
          p
        )
      ),
      problems.join('\n')
    )
  })

  test('a change that does not reach the first one is named', () => {
    const plan = recipeBox()
    plan[2]!.dependsOn = []
    assert.match(problemsOf(plan)[0]!, /Add "data" to dependsOn of: save/)
  })

  test('reaching the first change through another change is enough', () => {
    const plan = recipeBox()
    plan[2]!.dependsOn = ['list']
    assert.deepStrictEqual(problemsOf(plan), [])
  })

  test('frontend changes need mock: true or a reason for none', () => {
    const plan = recipeBox()
    plan[0]!.body =
      'Store recipes with a title, steps and ingredients. Done when you can list them.'
    assert.match(problemsOf(plan)[0]!, /declared `mock: true`/)
    plan[0]!.body +=
      ' No mocks needed because the screens only call listRecipes, which exists.'
    assert.deepStrictEqual(problemsOf(plan), [])
  })

  test('a plan with no frontend change needs no mocks', () => {
    const plan = recipeBox().filter((c) => c.specialist !== 'frontend')
    plan[0]!.body =
      'Store recipes with a title and steps. Done when you can list them.'
    assert.deepStrictEqual(problemsOf(plan), [])
  })

  test('validatePlan refuses with every problem, one per line', () => {
    const plan = recipeBox()
    plan[1]!.body = 'Short.'
    plan[2]!.dependsOn = ['nope']
    assert.throws(
      () => validatePlan(plan),
      (error: Error) => {
        assert.match(error.message, /^The plan was not filed/)
        assert.strictEqual(error.message.split('\n- ').length, 3)
        return true
      }
    )
  })

  test('filing order puts each change after what it depends on', () => {
    const plan = recipeBox()
    plan[1]!.dependsOn = ['data', 'save']
    const order = filingOrder(validatePlan(plan)).map((c) => c.ref)
    assert.deepStrictEqual(order, ['data', 'save', 'list'])
  })
})

describe('a plan with several kinds of problem', () => {
  test('one refusal names the shape and the content problems together', () => {
    const plan = recipeBox() as any[]
    delete plan[1].specialist
    plan[2].dependsOn = ['recipes']
    plan[2].body = 'Short.'
    const problems = problemsOf(plan)
    assert.strictEqual(problems.length, 3, problems.join('\n'))
    assert.match(problems[0]!, /"specialist" must be one of/)
    assert.match(problems[1]!, /dependsOn names "recipes"/)
    assert.match(problems[2]!, /shorter than a sentence/)
  })
})
