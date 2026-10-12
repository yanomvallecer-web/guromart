import { describe, expect, it } from "vitest";
import { depedFlags } from "./deped-rules";

const base = { title: "Heat vs. Temperature worksheet", summary: null, topic: null, description: "Ten activities I wrote for Grade 7.", price_centavos: 5000 };

describe("depedFlags", () => {
  it("passes a teacher's own work", () => {
    expect(depedFlags(base)).toEqual([]);
    expect(depedFlags({ ...base, title: "Grade 7 Science DLL, Quarter 1 Week 2" })).toEqual([]);
  });
  it("flags DepEd's own materials", () => {
    expect(depedFlags({ ...base, title: "Science 7 Self-Learning Module Q1" })).toHaveLength(1);
    expect(depedFlags({ ...base, description: "Complete SLMs for the whole quarter." })).toHaveLength(1);
    expect(depedFlags({ ...base, topic: "MATATAG curriculum guide, all subjects" })).toHaveLength(1);
  });
  it("flags blank DLL templates only when they cost money", () => {
    const blank = { ...base, title: "Editable DLL template, blank" };
    expect(depedFlags(blank)).toHaveLength(1);
    expect(depedFlags({ ...blank, price_centavos: 0 })).toEqual([]);
  });
});
