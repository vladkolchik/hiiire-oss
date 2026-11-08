import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const packageJson = readFileSync("package.json", "utf8");
const packageLock = readFileSync("package-lock.json", "utf8");

const allowedPackages = [
  "@fullcalendar/core",
  "@fullcalendar/react",
  "@fullcalendar/daygrid",
  "@fullcalendar/timegrid",
  "@fullcalendar/interaction",
  "@fullcalendar/list",
];

test("calendar uses only standard FullCalendar packages", () => {
  const packageConfig = JSON.parse(packageJson) as { dependencies?: Record<string, string> };
  const installedFullCalendarPackages = Object.keys(packageConfig.dependencies ?? {}).filter((name) => name.startsWith("@fullcalendar/"));

  assert.deepEqual(installedFullCalendarPackages.sort(), allowedPackages.sort());

  for (const source of [packageJson, packageLock]) {
    assert.doesNotMatch(source, /@fullcalendar\/resource/);
    assert.doesNotMatch(source, /@fullcalendar\/timeline/);
    assert.doesNotMatch(source, /fullcalendar-scheduler/);
    assert.doesNotMatch(source, /@sx-premium\//);
  }
});

test("calendar code does not configure premium scheduler features", () => {
  const files = [
    "components/dashboard/full-calendar-interviews.tsx",
    "app/(dashboard)/dashboard/calendar/page.tsx",
  ].filter((file) => existsSync(file));

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /schedulerLicenseKey/);
    assert.doesNotMatch(source, /resource(TimeGrid|Timeline|DayGrid|Area)/);
    assert.doesNotMatch(source, /@fullcalendar\/resource/);
    assert.doesNotMatch(source, /@fullcalendar\/timeline/);
  }
});
