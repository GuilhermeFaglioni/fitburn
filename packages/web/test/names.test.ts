import { firstName, professorLabel, shortName } from "../src/lib/names";
import { instructorOptionLabel } from "../src/pages/agenda/instructor-label";

describe("nomes", () => {
  it("firstName pega a primeira palavra, ignorando espaços extras", () => {
    expect(firstName("Rafael Andrade")).toBe("Rafael");
    expect(firstName("  Camila   Torres ")).toBe("Camila");
    expect(firstName("Rafael")).toBe("Rafael");
  });

  it("shortName usa o primeiro nome quando ninguém do conjunto o repete", () => {
    expect(shortName("Rafael Andrade", ["Rafael Andrade", "Camila Torres"])).toBe("Rafael");
    expect(shortName("Rafael Andrade")).toBe("Rafael");
  });

  it("shortName usa o nome completo quando outro professor tem o mesmo primeiro nome", () => {
    const peers = ["Rafael Andrade", "Rafael Souza", "Camila Torres"];
    expect(shortName("Rafael Andrade", peers)).toBe("Rafael Andrade");
    expect(shortName("Rafael Souza", peers)).toBe("Rafael Souza");
    expect(shortName("Camila Torres", peers)).toBe("Camila");
  });

  it("o mesmo professor repetido no conjunto não conta como colisão", () => {
    expect(shortName("Rafael Andrade", ["Rafael Andrade", "Rafael Andrade"])).toBe("Rafael");
  });

  it("professorLabel prefixa Prof.", () => {
    expect(professorLabel("Rafael Andrade")).toBe("Prof. Rafael");
    expect(professorLabel("Rafael Andrade", ["Rafael Souza"])).toBe("Prof. Rafael Andrade");
  });

  it("os selects administrativos mostram o nome completo", () => {
    expect(instructorOptionLabel("Rafael Andrade", false)).toBe("Prof. Rafael Andrade");
    expect(instructorOptionLabel("Rafael Andrade", true)).toBe("Prof. Rafael Andrade (titular)");
    expect(instructorOptionLabel("Rafael Souza", false)).not.toBe(
      instructorOptionLabel("Rafael Andrade", false),
    );
  });
});
