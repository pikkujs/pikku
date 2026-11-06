declare module 'x' { export const a: 'Hello type string' }
export abstract class A { abstract m(): 'Hello abstract type'; static { const x = 'Hello static block text' } }
using r = fn('Hello using text')
export const t = satisfiesFn('Hello satisfies fn')
declare function fn(x: string): any
declare function satisfiesFn(x: string): any
