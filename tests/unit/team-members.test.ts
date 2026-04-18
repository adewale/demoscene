import { describe, expect, it } from "vitest";

import { TEAM_MEMBERS } from "../../src/config/repositories";

describe("TEAM_MEMBERS", () => {
  it("matches the tracked team roster", () => {
    expect(TEAM_MEMBERS).toMatchInlineSnapshot(`
      [
        {
          "login": "craigsdennis",
          "name": "Craig",
        },
        {
          "login": "megaconfidence",
          "name": "Confidence",
        },
        {
          "login": "fayazara",
          "name": "Fayaz",
        },
        {
          "login": "jillesme",
          "name": "Jilles",
        },
        {
          "login": "lauragift21",
          "name": "Gift",
        },
        {
          "login": "kristianfreeman",
          "name": "Kristian",
        },
        {
          "login": "harshil1712",
          "name": "Harshil",
        },
        {
          "login": "yusukebe",
          "name": "Yusuke",
        },
        {
          "login": "adewale",
          "name": "Ade",
        },
        {
          "login": "jamesqquick",
          "name": "James",
        },
      ]
    `);
  });
});
