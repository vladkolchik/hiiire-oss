import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

const roots = ["app", "components"];
const toastMethods = new Set(["success", "error", "info", "warning", "loading", "message"]);

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) return listSourceFiles(path);
    if (/\.(tsx?|mts)$/.test(path)) return [path];

    return [];
  });
}

function hasObjectProperty(objectLiteral: ts.ObjectLiteralExpression, propertyName: string): boolean {
  return objectLiteral.properties.some((property) => {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) return false;

    const name = property.name;
    return ts.isIdentifier(name) ? name.text === propertyName : ts.isStringLiteral(name) && name.text === propertyName;
  });
}

test("toast updates with a stable id explicitly reset description", () => {
  const violations: string[] = [];

  for (const filePath of roots.flatMap(listSourceFiles)) {
    const source = readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    function visit(node: ts.Node) {
      if (ts.isCallExpression(node)) {
        const isToastMember = ts.isPropertyAccessExpression(node.expression);
        const receiver = isToastMember ? node.expression.expression.getText(sourceFile) : node.expression.getText(sourceFile);
        const method = isToastMember ? node.expression.name.text : receiver;
        const options = node.arguments[1];

        if (
          receiver === "toast" &&
          (toastMethods.has(method) || method === "toast") &&
          options &&
          ts.isObjectLiteralExpression(options) &&
          hasObjectProperty(options, "id") &&
          !hasObjectProperty(options, "description")
        ) {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
          violations.push(`${filePath}:${line} toast.${method}`);
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  assert.deepEqual(violations, []);
});
