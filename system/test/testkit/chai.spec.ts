import {SinonSpy, spy} from 'sinon';
import * as chai from 'chai';
import ITestCallbackContext = Mocha.ITestCallbackContext;

export function delayedPromise(delay: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, delay));
}

const NO_TESTS_GRACE = 20;
const DEFAULT_TIMEOUT = 2 * 1000;
const _expect: SinonSpy & typeof chai.expect = spy(chai.expect) as any;
const assert = (chai as any).Assertion.prototype.assert = spy((chai as any).Assertion.prototype.assert);

declare namespace assertNoError {
    function forget(): void;
}

function assertNoError() {
    // sometimes (like when running inside expect()) the last array element is undefined
    const exceptions = assert.exceptions.filter(Boolean);
    assert.resetHistory();
    if (exceptions.length) {
        throw exceptions.pop();
    }
}

assertNoError.forget = function forget() {
    assert.resetHistory();
};
let noiseCount = 0;

function callCount() {
    return _expect.callCount - noiseCount;
}

export async function makePlan(count: number, testCase: (this: never) => (void | Promise<any>), timeout?: number): Promise<void>;
export async function makePlan(this: ITestCallbackContext, count: number, testCase: (this: ITestCallbackContext) => (void | Promise<any>), timeout?: number): Promise<void>;
export async function makePlan(this: ITestCallbackContext | never, count: number, testCase: (this: ITestCallbackContext | never) => (void | Promise<any>), timeout = DEFAULT_TIMEOUT): Promise<void> {
    const preCount = noiseCount;
    noiseCount = _expect.callCount;
    try {
        const start = Date.now();
        const waitForCount = (async () => {
            while (callCount() < count) {
                assertNoError();
                if ((Date.now() - start) > (timeout - NO_TESTS_GRACE)) {
                    throw new Error(`only ${callCount()} tests done out of ${count} planned`);
                }
                await delayedPromise(10);
            }
            assertNoError();
        })();
        await Promise.all([testCase.apply(this), waitForCount]);
        if (callCount() > count) {
            throw new Error(`${callCount()} tests done but only ${count} planned`);
        }
        await delayedPromise(NO_TESTS_GRACE);
        if (callCount() > count) {
            throw new Error(`${callCount()} tests done but only ${count} planned`);
        }
        assertNoError();
    } finally {
        noiseCount = preCount + count;
    }
}

export function plan(count: number, testCase: (this: ITestCallbackContext) => void | Promise<any>, timeout = DEFAULT_TIMEOUT) {
    return async function (this: ITestCallbackContext) {
        // this is a root-level plan
        _expect.resetHistory();
        noiseCount = 0;
        if (this) {
            this.timeout(timeout * 1000);
        } else {
            console.warn('plan should execute in mocha context');
        }
        await makePlan.call(this, count, testCase, timeout);
    }
}

export const expect: typeof chai.expect = _expect;

export function obj(seed: any) {
    return {foo: seed} as any;
}

describe("chai testkit", function () {

    const SUB_TIMEOUT = 10;

    function assertOnce() {
        expect(3).to.equal(3);
    }


    beforeEach(() => {
        assert.resetHistory();
    });
    describe("makePlan", function () {
        it("runs the test (and succeeds when 0 assertions as planned)", async function () {
            let executed = false;
            await makePlan(0, () => {
                executed = true;
            });
            await expect(executed).to.equal(true);
        });
        it("succeeds when 1 assertion as planned", async function () {
            await makePlan(1, assertOnce);
        });
        it("waits for assertion and succeeds even if assertion is after promise", async function () {
            await makePlan(1, () => {
                // this will execute after the plan finishes
                setTimeout(() => assertOnce(), SUB_TIMEOUT);
            });
        });
        it("fails when too many assertions", async function () {
            const thrown = await makePlan(0, () => {
                assertOnce(); // the plan was for 0 tests, this should fail
            }).catch((e: Error) => e) as Error;
            expect(thrown).to.be.instanceof(Error);
            expect(thrown.message).to.equal('1 tests done but only 0 planned');
        });
        it("fails when too few assertions", async function () {
            const thrown = await makePlan(1, () => {
            }, 10).catch((e: Error) => e) as Error;
            expect(thrown).to.be.instanceof(Error);
            expect(thrown.message).to.equal('only 0 tests done out of 1 planned');
        });
        it("waits for assertion and succeeds even if assertion is after promise", async function () {
            await makePlan(1, () => {
                // this will execute after the plan finishes
                setTimeout(() => assertOnce(), SUB_TIMEOUT);
            });
        });
        it("supports multiple serial plans", async function () {
            await makePlan(2, () => {
                assertOnce();
                assertOnce();
            });
            await makePlan(1, assertOnce);
        });
        describe('nested plans', () => {
            it("succeeds with no tests", async function () {
                await makePlan(0, async () => makePlan(0, () => void 0));
            });
            it("succeeds with tests", async function () {
                await makePlan(2, async () => {
                    assertOnce();
                    await makePlan(1, assertOnce);
                    assertOnce();
                });
            });
            it("failswhen nesting plan has too many tests", async function () {
                const thrown = await makePlan(1, async () => {
                    assertOnce();
                    await makePlan(0, () => void 0);
                    assertOnce();
                }).catch((e: Error) => e) as Error;
                expect(thrown).to.be.instanceof(Error);
                expect(thrown.message).to.equal('2 tests done but only 1 planned');
            });
            it("fails when nesting plan has too few tests", async function () {
                const thrown = await makePlan(1, async () => {
                    await makePlan(0, () => void 0);
                }, SUB_TIMEOUT).catch((e: Error) => e) as Error;
                expect(thrown).to.be.instanceof(Error);
                expect(thrown.message).to.equal('only 0 tests done out of 1 planned');
            });
            it("fails when nested plan has too many tests", async function () {
                const thrown = await makePlan(0, async () => {
                    await makePlan(0, assertOnce);
                }).catch((e: Error) => e) as Error;
                expect(thrown).to.be.instanceof(Error);
                expect(thrown.message).to.equal('1 tests done but only 0 planned');
            });
            it("fails when nested plan has too few tests", async function () {
                const thrown = await makePlan(0, async () => {
                    await makePlan(1, () => void 0, SUB_TIMEOUT);
                }).catch((e: Error) => e) as Error;
                expect(thrown).to.be.instanceof(Error);
                expect(thrown.message).to.equal('only 0 tests done out of 1 planned');
            });
        });
    });
    describe("plan", function () {
        it("runs the test (and succeeds when 0 assertions as planned)", async function () {
            let executed = false;
            const thePlan = plan(0, () => {
                executed = true;
            }).bind(this);
            await thePlan();
            await expect(executed).to.equal(true);
        });
        it("succeeds when 1 assertion as planned", plan(1, () => {
            assertOnce();
        }));
        it("waits for assertion and succeeds even if assertion is after promise", plan(1, () => {
            // this will execute after the plan finishes
            setTimeout(() => assertOnce(), SUB_TIMEOUT);
        }));
        it("fails when too many assertions", async function () {
            const thePlan = plan(0, () => {
                assertOnce(); // the plan was for 0 tests, this should fail
            }).bind(this);
            const thrown = await thePlan().catch((e: Error) => e);
            expect(thrown).to.be.instanceof(Error);
            expect(thrown.message).to.equal('1 tests done but only 0 planned');
        });
        it("fails when too few assertions", async function () {
            const thePlan = plan(1, () => {
            }, 10).bind(this);
            const thrown = await thePlan().catch((e: Error) => e);
            expect(thrown).to.be.instanceof(Error);
            expect(thrown.message).to.equal('only 0 tests done out of 1 planned');
        });
        it("waits for too many assertions and fails even if assertion is after promise", async function () {
            const thePlan = plan(0, () => {
                // this will execute after the plan finishes
                setTimeout(() => assertOnce(), NO_TESTS_GRACE / 2);
            }, 10).bind(this);
            const thrown = await thePlan().catch((e: Error) => e);
            expect(thrown).to.be.instanceof(Error);
            expect(thrown.message).to.equal('1 tests done but only 0 planned');
        });
        it("throws original error if assertion failed", async function () {
            const error = new Error('foo');
            const thePlan = plan(0, () => {
                throw error;
            }).bind(this);
            const thrown = await thePlan().catch((e: Error) => e);
            expect(thrown).to.equal(error);
        });
        it("assertion error has priority over plan error", async function () {
            const error = new Error('foo');
            const thePlan = plan(0, () => {
                assertOnce(); // the plan was for 0 tests, this should fail
                throw error;
            }).bind(this);
            const thrown = await thePlan().catch((e: Error) => e);
            expect(thrown).to.equal(error);
        });
    });
    describe("assertNoError", function () {
        it("does not throw when no assertion made", function () {
            expect(assertNoError).to.not.throw();
        });
        it("does not throw when no assertion error", function () {
            assertOnce();
            expect(assertNoError).to.not.throw();
        });
        it("throws original error when exists", function () {
            try {
                expect(3).equal(4);
            } catch (e) {
            }
            expect(assertNoError).to.throw(chai.AssertionError, 'expected 3 to equal 4');
        });
        it("does not throw after cleanup (forgets)", function () {
            try {
                expect(3).equal(4);
            } catch (e) {
            }
            assertNoError.forget();
            expect(assertNoError).to.not.throw();
        });
        it("does not throw on second assertion (forgets on assertion)", function () {
            try {
                expect(3).equal(4);
            } catch (e) {
            }
            try {
                assertNoError();
            } catch (e) {
            }
            expect(assertNoError).to.not.throw();
        });
    });
});
