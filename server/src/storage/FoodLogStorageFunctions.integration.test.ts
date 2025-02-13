import crypto from "node:crypto";
import {
  CreateFoodLogEntry,
  EditFoodLogEntry,
  isNotFoundError,
  isValidationError
} from "./types";
import fs from "node:fs";
import { parse } from "csv-parse/sync";
import { configs } from "./_testConfigs";
import { METRIC_MAX } from "../config";

describe.each(configs)(
  "$name Food Log Storage Integration Tests",
  ({ config }) => {
    let testClient: any;
    beforeAll(async () => {
      testClient = await config.beforeAllSetup();
    });
    afterAll(async () => {
      await config.afterAllTeardown(testClient);
    });
    test("Happy Path :: Bad Retreives, Creates, Retreives, Edits, Reretrieves, Deletes, Fails Retreive", async () => {
      const testUserId = crypto.randomUUID();

      const randomId = crypto.randomUUID();

      const badResult = await (config.storage.foodLog.retrieveFoodLog as any)(
        testUserId,
        randomId,
        testClient
      );

      expect(badResult.isErr()).toBeTruthy();
      expect(isNotFoundError(badResult._unsafeUnwrapErr())).toBeTruthy();

      const input: CreateFoodLogEntry = {
        name: "My Food Log",
        labels: ["Some Label", "Some other label"],
        time: {
          start: new Date(),
          end: new Date()
        },
        metrics: {
          calories: 500
        }
      };

      const result = await (config.storage.foodLog.storeFoodLog as any)(
        testUserId,
        input,
        testClient
      );

      expect(result.isOk()).toBeTruthy();
      const testItemId = result._unsafeUnwrap();
      expect(testItemId.length).toBeGreaterThan(0);

      const storedItemResult = await (
        config.storage.foodLog.retrieveFoodLog as any
      )(testUserId, testItemId, testClient);

      expect(storedItemResult.isOk()).toBeTruthy();
      const storedItem = storedItemResult._unsafeUnwrap();
      expect(storedItem).toEqual({ id: testItemId, ...input });

      storedItem.name = "Modified Food Log";
      storedItem.metrics = {
        calories: 400
      };

      const modifiedResult = await (config.storage.foodLog.editFoodLog as any)(
        testUserId,
        storedItem,
        testClient
      );
      expect(modifiedResult.isOk()).toBeTruthy();
      const modified = modifiedResult._unsafeUnwrap();
      expect(modified).toEqual(storedItem);

      const reretrievedItemResult = await (
        config.storage.foodLog.retrieveFoodLog as any
      )(testUserId, testItemId, testClient);

      expect(reretrievedItemResult.isOk()).toBeTruthy();
      const reretreived = reretrievedItemResult._unsafeUnwrap();
      expect(reretreived).toEqual(storedItem);

      const deleteResult = await (config.storage.foodLog.deleteFoodLog as any)(
        testUserId,
        testItemId,
        testClient
      );

      expect(deleteResult.isOk()).toBeTruthy();
      expect(deleteResult._unsafeUnwrap()).toBeTruthy();

      const postDeleteRetrieve = await (
        config.storage.foodLog.retrieveFoodLog as any
      )(testUserId, testItemId, testClient);

      expect(postDeleteRetrieve.isErr()).toBeTruthy();
      expect(
        isNotFoundError(postDeleteRetrieve._unsafeUnwrapErr())
      ).toBeTruthy();

      const redeleteResult = await (
        config.storage.foodLog.deleteFoodLog as any
      )(testUserId, testItemId, testClient);

      expect(redeleteResult.isOk()).toBeTruthy();
      expect(redeleteResult._unsafeUnwrap()).toBeTruthy();
    });

    test("Queries :: can add some logs, and get expected query results", async () => {
      const testUserId = crypto.randomUUID();

      const pastLog: CreateFoodLogEntry = {
        name: "My Food Log",
        labels: [],
        time: {
          start: new Date(1999, 10, 10),
          end: new Date(1999, 10, 11)
        },
        metrics: {
          calories: 500
        }
      };

      const centerLog: CreateFoodLogEntry = {
        name: "My Food Log",
        labels: [],
        time: {
          start: new Date(1999, 10, 15),
          end: new Date(1999, 10, 16)
        },
        metrics: {
          calories: 500
        }
      };

      const futureLog: CreateFoodLogEntry = {
        name: "My Food Log",
        labels: [],
        time: {
          start: new Date(1999, 10, 20),
          end: new Date(1999, 10, 21)
        },
        metrics: {
          calories: 500
        }
      };

      const past = await (config.storage.foodLog.storeFoodLog as any)(
        testUserId,
        pastLog,
        testClient
      );
      const pastItemId = past._unsafeUnwrap();

      const result = await (config.storage.foodLog.storeFoodLog as any)(
        testUserId,
        centerLog,
        testClient
      );
      const centerItemId = result._unsafeUnwrap();

      const result2 = await (config.storage.foodLog.storeFoodLog as any)(
        testUserId + "alt",
        centerLog,
        testClient
      );
      const altCenterItemId = result2._unsafeUnwrap();

      const future = await (config.storage.foodLog.storeFoodLog as any)(
        testUserId,
        futureLog,
        testClient
      );
      const futureItemId = future._unsafeUnwrap();

      const startingQueryResult = await (
        config.storage.foodLog.queryFoodLogs as any
      )(testUserId, new Date(1999, 10, 15), new Date(1999, 10, 16), testClient);

      expect(startingQueryResult.isOk()).toBeTruthy();
      const firstTest = startingQueryResult._unsafeUnwrap();
      expect(firstTest.length).toBe(1);
      expect(firstTest[0].id).toBe(centerItemId);
      expect(firstTest[0].id).not.toBe(altCenterItemId);

      const pastQueryResult = await (
        config.storage.foodLog.queryFoodLogs as any
      )(testUserId, new Date(1999, 10, 9), new Date(1999, 10, 16), testClient);

      expect(pastQueryResult.isOk()).toBeTruthy();
      const secondTest = pastQueryResult._unsafeUnwrap();
      expect(secondTest.length).toBe(2);
      expect(secondTest.map((x: any) => x.id).sort()).toEqual(
        [pastItemId, centerItemId].sort()
      );

      const futureQueryResult = await (
        config.storage.foodLog.queryFoodLogs as any
      )(testUserId, new Date(1999, 10, 15), new Date(1999, 10, 30), testClient);

      expect(futureQueryResult.isOk()).toBeTruthy();
      const thirdTest = futureQueryResult._unsafeUnwrap();
      expect(thirdTest.length).toBe(2);
      expect(thirdTest.map((x: any) => x.id).sort()).toEqual(
        [centerItemId, futureItemId].sort()
      );

      const wildQueryResult = await (
        config.storage.foodLog.queryFoodLogs as any
      )(testUserId, new Date(2012, 0, 1), new Date(2012, 11, 31), testClient);

      expect(startingQueryResult.isOk()).toBeTruthy();
      const wildTest = wildQueryResult._unsafeUnwrap();
      expect(wildTest.length).toBe(0);
    });

    test("Bulk Actions :: Can dump logs to temp file", async () => {
      const testUserId = crypto.randomUUID();
      const logs: any[] = [];

      for (let i = 0; i < 12345; i++) {
        const pastLog: CreateFoodLogEntry = {
          name: "My Food Log " + i,
          labels: ["some-label-" + i],
          time: {
            start: new Date(1999, 10, 10),
            end: new Date(1999, 10, 11)
          },
          metrics: {
            calories: 500 + 1
          }
        };

        const past = await (config.storage.foodLog.storeFoodLog as any)(
          testUserId,
          pastLog,
          testClient
        );
        const pastItemId = past._unsafeUnwrap();
        logs.push({
          id: pastItemId,
          name: pastLog.name,
          labels: pastLog.labels,
          timeStart: pastLog.time.start.toISOString(),
          timeEnd: pastLog.time.end.toISOString(),
          metrics: pastLog.metrics
        });
      }

      const bulkFilepathResult = await (
        config.storage.foodLog.bulkExportFoodLogs as any
      )(testUserId, testClient);
      const tempFilename = bulkFilepathResult._unsafeUnwrap();
      const filedata = fs.readFileSync(tempFilename);
      const filedataString = filedata.toString("utf8");
      const records = parse(filedataString, {
        columns: true,
        skip_empty_lines: true
      }).map((x: any) => {
        return {
          ...x,
          metrics: JSON.parse(x.metrics),
          labels: JSON.parse(x.labels)
        };
      }) as any[];
      records.sort((a, b) =>
        a.name.normalize().localeCompare(b.name.normalize())
      );
      logs.sort((a, b) => a.name.normalize().localeCompare(b.name.normalize()));
      expect(logs.length).toBe(12345);
      expect(records.length).toBe(12345);
      expect(records).toStrictEqual(logs);
    }, 60_000);

    test("Purge Logs", async () => {
      const testUserId = crypto.randomUUID();

      const secondUserId = crypto.randomUUID();

      const logsToMake = [
        ["Some Name", 123],
        ["Some Other Name", 456],
        ["Some Extra Name", 134],
        ["Just One More", 677]
      ];

      const inputs = logsToMake.map(
        ([logName, calories]) =>
          ({
            name: logName,
            labels: ["Some Label", "Some other label"],
            time: {
              start: new Date(),
              end: new Date()
            },
            metrics: {
              calories
            }
          } as CreateFoodLogEntry)
      );

      const results = await Promise.all(
        inputs.map(async (input) => {
          return await (config.storage.foodLog.storeFoodLog as any)(
            testUserId,
            input,
            testClient
          );
        })
      );

      const secondResults = await Promise.all(
        inputs.map(async (input) => {
          return await (config.storage.foodLog.storeFoodLog as any)(
            secondUserId,
            input,
            testClient
          );
        })
      );

      expect(results.every((x) => x.isOk())).toBe(true);
      const ids: string[] = results.map((r) => r._unsafeUnwrap());

      expect(secondResults.every((x) => x.isOk())).toBe(true);
      const secondIds: string[] = secondResults.map((r) => r._unsafeUnwrap());

      const retrieves: boolean[] = await Promise.all(
        ids.map(async (testItemId) => {
          return (
            await (config.storage.foodLog.retrieveFoodLog as any)(
              testUserId,
              testItemId,
              testClient
            )
          ).isOk();
        })
      );

      expect(retrieves.every((x) => x === true)).toBeTruthy();

      const secondRetreives: boolean[] = await Promise.all(
        secondIds.map(async (testItemId) => {
          return (
            await (config.storage.foodLog.retrieveFoodLog as any)(
              secondUserId,
              testItemId,
              testClient
            )
          ).isOk();
        })
      );

      expect(secondRetreives.every((x) => x === true)).toBeTruthy();

      const res = await (config.storage.foodLog.purgeFoodLogs as any)(
        testUserId,
        testClient
      );

      expect(res.isOk()).toBe(true);

      const reretrieves: any[] = await Promise.all(
        ids.map(async (testItemId) => {
          return await (config.storage.foodLog.retrieveFoodLog as any)(
            testUserId,
            testItemId,
            testClient
          );
        })
      );

      expect(reretrieves.every((x) => x.isOk() === false)).toBeTruthy();
      expect(
        reretrieves.every((x) => isNotFoundError(x._unsafeUnwrapErr()))
      ).toBeTruthy();

      const secondReRetreives: boolean[] = await Promise.all(
        secondIds.map(async (testItemId) => {
          return (
            await (config.storage.foodLog.retrieveFoodLog as any)(
              secondUserId,
              testItemId,
              testClient
            )
          ).isOk();
        })
      );

      expect(secondReRetreives.every((x) => x === true)).toBeTruthy();
    });
  }
);

describe.each(configs)(
  "$name FoodLogStorageFunctions",
  ({ config: { storage: { foodLog: config } } }) => {
    describe("CreateFoodLog", () => {
      describe("Validation Errors", () => {
        const GoldInput: CreateFoodLogEntry = {
          name: "My Food Log",
          labels: ["Some Label", "Some other label"],
          time: {
            start: new Date(1999, 10, 10),
            end: new Date(1999, 10, 11)
          },
          metrics: {
            calories: 500
          }
        };

        const testUserId = crypto.randomUUID();

        const { name, ...nameless } = structuredClone(GoldInput);
        const { labels, ...labelless } = structuredClone(GoldInput);
        const { metrics, ...metricless } = structuredClone(GoldInput);
        const nullMetrics = { ...structuredClone(GoldInput), metrics: null };
        const weirdMetric: any = structuredClone(GoldInput);
        weirdMetric.metrics.calories = "This is not a number";
        const oversizeMetric: any = structuredClone(GoldInput);
        oversizeMetric.metrics.calories = METRIC_MAX + 1;
        const { time, ...timeless } = structuredClone(GoldInput);
        const startTimeLess: any = structuredClone(GoldInput);
        delete startTimeLess.time.start;
        const endTimeLess: any = structuredClone(GoldInput);
        delete endTimeLess.time.end;
        const endBeforeStart = structuredClone(GoldInput);
        endBeforeStart.time.start = new Date(1999, 10, 10);
        endBeforeStart.time.end = new Date(1999, 8, 10);

        const BadValues: any[] = [
          ["Empty", {}],
          ["WithId", { ...GoldInput, id: crypto.randomUUID() }],
          ["No Name", nameless],
          ["No Labels", labelless],
          ["No Metrics", metricless],
          ["Null Metrics", nullMetrics],
          ["Non-number Metric", weirdMetric],
          ["Metric greater than maxint", oversizeMetric],
          ["No Times", timeless],
          ["No Start Time", startTimeLess],
          ["No End Time", endTimeLess],
          ["End before start", endBeforeStart]
        ];

        it.each(BadValues)(
          "Rejects Bad Test Case %s",
          async (name: string, badValue: any) => {
            const result = await config.storeFoodLog(testUserId, badValue);

            expect(result.isErr()).toBeTruthy();
            expect(isValidationError(result._unsafeUnwrapErr())).toBeTruthy();
          }
        );
      });
    });

    describe("QueryFoodLog", () => {
      describe("Validation Errors", () => {
        it("Rejects disordered dates", async () => {
          const result = await config.queryFoodLogs(
            crypto.randomUUID(),
            new Date(1997, 10, 1),
            new Date(1987, 10, 1)
          );

          expect(result.isErr()).toBeTruthy();
          expect(isValidationError(result._unsafeUnwrapErr())).toBeTruthy();
        });
      });
    });

    describe("EditFoodLog", () => {
      describe("Validation Errors", () => {
        const GoldInput: EditFoodLogEntry = {
          id: crypto.randomUUID(),
          name: "My Food Log",
          labels: ["Some Label", "Some other label"],
          time: {
            start: new Date(),
            end: new Date()
          },
          metrics: {
            calories: 500
          }
        };

        const testUserId = crypto.randomUUID();

        const weirdMetric: any = structuredClone(GoldInput);
        weirdMetric.metrics.calories = "This is not a number";
        const oversizeMetric: any = structuredClone(GoldInput);
        oversizeMetric.metrics.calories = METRIC_MAX + 1;
        const startTimeLess: any = structuredClone(GoldInput);
        delete startTimeLess.time.start;
        const endTimeLess: any = structuredClone(GoldInput);
        delete endTimeLess.time.end;
        const endBeforeStart = structuredClone(GoldInput);
        endBeforeStart.time!.start = new Date(1999, 10, 10);
        endBeforeStart.time!.end = new Date(1999, 8, 10);

        const BadValues: any[] = [
          ["Empty", {}],
          ["WithoutId", { ...GoldInput, id: undefined }],
          ["Non-number Metric", weirdMetric],
          ["Metric greater than maxint", oversizeMetric],
          ["No Start Time", startTimeLess],
          ["No End Time", endTimeLess],
          ["End before start", endBeforeStart]
        ];

        it.each(BadValues)(
          "Rejects Bad Test Case %s",
          async (name: string, badValue: any) => {
            const result = await config.editFoodLog(testUserId, badValue);

            expect(result.isErr()).toBeTruthy();
            expect(isValidationError(result._unsafeUnwrapErr())).toBeTruthy();
          }
        );
      });
    });
  }
);
