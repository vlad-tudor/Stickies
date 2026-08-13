import { test, expect, describe } from "bun:test";
import * as Y from "yjs";
import { fragmentToHtml } from "./editorExtensions";

const paragraph = (text: string): Y.XmlElement => {
  const node = new Y.XmlElement("paragraph");
  node.insert(0, [new Y.XmlText(text)]);
  return node;
};

describe("fragmentToHtml", () => {
  test("serializes body content through the shared schema", () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("body");
    fragment.insert(0, [paragraph("hello")]);
    expect(fragmentToHtml(fragment)).toBe("<p>hello</p>");
  });

  test("marks and block attributes survive", () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("body");
    const heading = new Y.XmlElement("heading");
    heading.setAttribute("level", "1");
    heading.insert(0, [new Y.XmlText("title")]);
    const body = new Y.XmlElement("paragraph");
    const text = new Y.XmlText();
    text.insert(0, "bold", { bold: {} });
    body.insert(0, [text]);
    fragment.insert(0, [heading, body]);
    expect(fragmentToHtml(fragment)).toBe("<h1>title</h1><p><strong>bold</strong></p>");
  });
});
