import assert from "node:assert/strict";
import test from "node:test";

import { formatClientCreditTopupPaidEmail } from "../lib/email/format.ts";

test("client emails use the neutral hiiire site styling instead of the old gradient card", () => {
  const content = formatClientCreditTopupPaidEmail({
    companyName: "ООО Рекрутинг",
    credits: 5000,
    amountKopecks: 7_500_000,
  });

  assert.equal(content.subject, "Пополнение баланса оплачено");
  assert.match(content.html, /background:#fafafa/);
  assert.match(content.html, /border:1px solid #e4e4e7/);
  assert.match(content.html, /border-radius:8px/);
  assert.match(content.html, /color:#09090b/);
  assert.match(content.html, />hiiire</);
  assert.match(content.html, /Пополнение баланса оплачено/);
  assert.match(content.html, /ООО Рекрутинг/);
  assert.doesNotMatch(content.html, /linear-gradient/);
  assert.doesNotMatch(content.html, /#0b1220|#0ea5e9|#6366f1/i);
});
