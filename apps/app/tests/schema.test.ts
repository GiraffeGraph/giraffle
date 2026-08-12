import { schemaSql } from "@/infrastructure/database/schema";

describe("universal page schema",()=>{
  it("creates recursive pages with custom states, local categories, and planning fields",()=>{
    expect(schemaSql).toContain("CREATE TABLE page_states");
    expect(schemaSql).toContain("CREATE TABLE page_categories");
    for(const field of ["state_id","category_id","priority","scheduled_at","duration_minutes","child_view"]){
      expect(schemaSql).toContain(field);
    }
  });

  it("keeps archive separate from semantic state",()=>{
    expect(schemaSql).toContain("is_archived INTEGER");
    expect(schemaSql).toContain("family TEXT NOT NULL CHECK(family IN ('forever','open','done'))");
    expect(schemaSql).not.toContain("'archived'");
  });

});
