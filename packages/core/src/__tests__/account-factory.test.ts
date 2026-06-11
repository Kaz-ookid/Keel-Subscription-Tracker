import { describe, expect, it } from "vitest";
import { makeAccount } from "../index";

describe("makeAccount", () => {
  it("builds an active account from form input, trimming text fields", () => {
    const account = makeAccount(
      {
        name: "  Compte courant BNP ",
        type: "checking",
        currency: "EUR",
        institution: " BNP Paribas ",
        color: "#3B82F6",
        icon: "building.columns.fill",
      },
      { id: "acc-1" },
    );

    expect(account).toEqual({
      id: "acc-1",
      name: "Compte courant BNP",
      type: "checking",
      currency: "EUR",
      institution: "BNP Paribas",
      color: "#3B82F6",
      icon: "building.columns.fill",
      isArchived: false,
    });
  });

  it("drops an empty institution rather than storing whitespace", () => {
    const account = makeAccount(
      {
        name: "Cash",
        type: "other",
        currency: "EUR",
        institution: "  ",
        color: "#111",
        icon: "wallet.bifold.fill",
      },
      { id: "acc-2" },
    );
    expect(account.institution).toBeUndefined();
  });
});
