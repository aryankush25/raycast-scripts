#!/usr/bin/env node

// Required parameters:
// @raycast.schemaVersion 1
// @raycast.title Sync Bookmarks
// @raycast.mode fullOutput
// @raycast.packageName Browser

// Optional parameters:
// @raycast.icon 🔖
// @raycast.description Sync bookmarks between browsers and profiles
// @raycast.argument1 { "type": "dropdown", "title": "Source Browser", "placeholder": "vivaldi, chrome, brave, firefox", "data": [{"title": "🔴 Vivaldi", "value": "vivaldi"}, {"title": "🦊 Firefox", "value": "firefox"}, {"title": "🟡 Chrome", "value": "chrome"}, {"title": "🦁 Brave", "value": "brave"}] }
// @raycast.argument2 { "type": "dropdown", "title": "Destination Browser", "placeholder": "vivaldi, chrome, brave", "data": [{"title": "🔴 Vivaldi", "value": "vivaldi"}, {"title": "🟡 Chrome", "value": "chrome"}, {"title": "🦁 Brave", "value": "brave"}] }
// @raycast.argument3 { "type": "dropdown", "title": "Sync Mode", "placeholder": "merge or replace", "data": [{"title": "🔀 Merge (safe)", "value": "merge"}, {"title": "♻️  Replace (overwrite)", "value": "replace"}] }

const fs = require("fs");
const path = require("path");
const os = require("os");

// ─── Config ───────────────────────────────────────────────────────────────────

const HOME = os.homedir();

const BROWSERS = {
  vivaldi: {
    name: "Vivaldi",
    basePath: path.join(HOME, "Library/Application Support/Vivaldi"),
    format: "chromium",
  },
  chrome: {
    name: "Chrome",
    basePath: path.join(HOME, "Library/Application Support/Google/Chrome"),
    format: "chromium",
  },
  brave: {
    name: "Brave",
    basePath: path.join(
      HOME,
      "Library/Application Support/BraveSoftware/Brave-Browser",
    ),
    format: "chromium",
  },
  firefox: {
    name: "Firefox",
    basePath: path.join(HOME, "Library/Application Support/Firefox/Profiles"),
    format: "firefox",
  },
};

// ─── Args ─────────────────────────────────────────────────────────────────────

const [, , sourceBrowserId, destBrowserId, mode = "merge"] = process.argv;

if (!sourceBrowserId || !destBrowserId) {
  console.error("❌ Please provide source and destination browsers.");
  process.exit(1);
}

if (sourceBrowserId === destBrowserId) {
  console.error("❌ Source and destination browsers must be different.");
  process.exit(1);
}

// ─── Profile Discovery ────────────────────────────────────────────────────────

function getChromiumProfiles(basePath) {
  if (!fs.existsSync(basePath)) return [];
  return fs
    .readdirSync(basePath)
    .filter((entry) => fs.existsSync(path.join(basePath, entry, "Bookmarks")))
    .map((entry) => {
      let name = entry;
      const prefsPath = path.join(basePath, entry, "Preferences");
      if (fs.existsSync(prefsPath)) {
        try {
          const prefs = JSON.parse(fs.readFileSync(prefsPath, "utf-8"));
          name = prefs?.profile?.name || entry;
        } catch {}
      }
      return { id: entry, name, fullPath: path.join(basePath, entry) };
    });
}

function getFirefoxProfiles(basePath) {
  if (!fs.existsSync(basePath)) return [];
  return fs
    .readdirSync(basePath)
    .filter((entry) =>
      fs.existsSync(path.join(basePath, entry, "places.sqlite")),
    )
    .map((entry) => ({
      id: entry,
      name: entry.split(".").slice(1).join(".") || entry,
      fullPath: path.join(basePath, entry),
    }));
}

function getProfiles(browserId) {
  const browser = BROWSERS[browserId];
  if (!browser) return [];
  return browser.format === "firefox"
    ? getFirefoxProfiles(browser.basePath)
    : getChromiumProfiles(browser.basePath);
}

// ─── Pick profile via osascript dialog ───────────────────────────────────────

function pickProfile(browserId, label) {
  const profiles = getProfiles(browserId);
  if (profiles.length === 0) {
    console.error(
      `❌ No profiles found for ${BROWSERS[browserId]?.name || browserId}`,
    );
    process.exit(1);
  }

  const { execSync } = require("child_process");
  const options = profiles.map((p) => `"${p.name}"`).join(", ");
  const script = `
    set options to {${options}}
    set chosen to choose from list options with title "Bookmark Sync" with prompt "Select ${label} profile:" default items {item 1 of options}
    if chosen is false then error "Cancelled"
    item 1 of chosen
  `;

  try {
    const result = execSync(`osascript -e '${script}'`, {
      encoding: "utf-8",
    }).trim();
    return profiles.find((p) => p.name === result) || profiles[0];
  } catch {
    console.error("❌ Profile selection cancelled.");
    process.exit(1);
  }
}

// ─── Read Bookmarks ───────────────────────────────────────────────────────────

function readChromiumBookmarks(profilePath) {
  const file = path.join(profilePath, "Bookmarks");
  const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
  return ["bookmark_bar", "other", "synced"]
    .filter((k) => raw.roots[k])
    .map((k) => ({ key: k, node: raw.roots[k] }));
}

// Firefox root GUIDs → Chromium root keys
// toolbar → bookmark_bar, menu + unfiled + mobile → other
const FIREFOX_ROOT_GUIDS = {
  toolbar_____: "bookmark_bar",
  menu________: "other",
  unfiled_____: "other",
  mobile______: "other",
  // tags________ is intentionally excluded
};

function readFirefoxBookmarks(profilePath) {
  const { execSync } = require("child_process");
  const dbPath = path.join(profilePath, "places.sqlite");

  if (!fs.existsSync(dbPath)) {
    console.error("❌ Firefox places.sqlite not found at: " + dbPath);
    process.exit(1);
  }

  // Copy DB — Firefox may have a WAL lock while running
  const tmpDb = path.join(os.tmpdir(), `ff_places_${Date.now()}.sqlite`);
  const tmpWal = dbPath + "-wal";
  const tmpShm = dbPath + "-shm";
  fs.copyFileSync(dbPath, tmpDb);
  // Copy WAL files too so the copy is consistent
  if (fs.existsSync(tmpWal)) fs.copyFileSync(tmpWal, tmpDb + "-wal");
  if (fs.existsSync(tmpShm)) fs.copyFileSync(tmpShm, tmpDb + "-shm");

  // Recursive CTE — walks only under the 4 real bookmark roots (skips tags)
  const query = `
    WITH RECURSIVE tree AS (
      SELECT
        b.id, b.parent, b.title, b.type, b.position,
        p.url, b.guid, b.guid AS root_guid
      FROM moz_bookmarks b
      LEFT JOIN moz_places p ON b.fk = p.id
      WHERE b.guid IN ('toolbar_____','menu________','unfiled_____','mobile______')

      UNION ALL

      SELECT
        b.id, b.parent, b.title, b.type, b.position,
        p.url, b.guid, t.root_guid
      FROM moz_bookmarks b
      LEFT JOIN moz_places p ON b.fk = p.id
      JOIN tree t ON b.parent = t.id
      WHERE b.type IN (1, 2)
    )
    SELECT id, parent, COALESCE(title,'') AS title, type, url, root_guid
    FROM tree
    ORDER BY parent, position;
  `
    .replace(/\n/g, " ")
    .trim();

  let rows = [];
  try {
    const output = execSync(`sqlite3 "${tmpDb}" "${query}"`, {
      encoding: "utf-8",
    });
    rows = output
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("|");
        return {
          id: parseInt(parts[0]),
          parent: parseInt(parts[1]),
          title: parts[2] || "(Untitled)",
          type: parseInt(parts[3]), // 1=bookmark, 2=folder
          url: parts[4] || undefined,
          rootGuid: parts[5],
        };
      });
  } catch (e) {
    console.error(
      "❌ Failed to read Firefox bookmarks.\n   Is sqlite3 installed? Run: brew install sqlite3",
    );
    console.error("   Detail: " + e.message);
    process.exit(1);
  } finally {
    [tmpDb, tmpDb + "-wal", tmpDb + "-shm"].forEach((f) => {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
  }

  // Build node map
  const nodeMap = new Map();
  for (const row of rows) {
    nodeMap.set(row.id, {
      _id: row.id,
      _parent: row.parent,
      _rootGuid: row.rootGuid,
      type: row.type === 2 ? "folder" : "url",
      name: row.title,
      url: row.url,
      children: row.type === 2 ? [] : undefined,
    });
  }

  // Build tree — group top-level nodes by their Chromium root key
  const chromiumRoots = {
    bookmark_bar: [],
    other: [],
  };

  for (const node of nodeMap.values()) {
    const parent = nodeMap.get(node._parent);
    if (parent) {
      // Non-root node — attach to parent
      if (parent.children) parent.children.push(node);
    } else {
      // Root node — this IS one of the 4 Firefox roots, map it to chromium key
      const chromiumKey = FIREFOX_ROOT_GUIDS[node._rootGuid] || "other";
      // Push its children directly (we don't want "Bookmarks Toolbar" as a wrapper folder)
      for (const child of node.children || []) {
        chromiumRoots[chromiumKey].push(child);
      }
    }
  }

  return [
    {
      key: "bookmark_bar",
      node: {
        type: "folder",
        name: "Bookmarks bar",
        children: chromiumRoots.bookmark_bar,
      },
    },
    {
      key: "other",
      node: {
        type: "folder",
        name: "Other bookmarks",
        children: chromiumRoots.other,
      },
    },
  ];
}

function readBookmarks(browserId, profilePath) {
  const browser = BROWSERS[browserId];
  return browser.format === "firefox"
    ? readFirefoxBookmarks(profilePath)
    : readChromiumBookmarks(profilePath);
}

// ─── Write Bookmarks ──────────────────────────────────────────────────────────

function flattenUrls(nodes = []) {
  const urls = [];
  for (const n of nodes) {
    if (n.type === "url" && n.url) urls.push(n.url);
    if (n.children) urls.push(...flattenUrls(n.children));
  }
  return urls;
}

function countUrls(nodes = []) {
  return flattenUrls(nodes).length;
}

function writeChromiumBookmarks(profilePath, incoming, merge) {
  const bookmarksPath = path.join(profilePath, "Bookmarks");
  const backupPath = `${bookmarksPath}.backup_${Date.now()}`;

  if (fs.existsSync(bookmarksPath)) fs.copyFileSync(bookmarksPath, backupPath);

  const data =
    merge && fs.existsSync(bookmarksPath)
      ? JSON.parse(fs.readFileSync(bookmarksPath, "utf-8"))
      : {
          checksum: "",
          roots: {
            bookmark_bar: {
              children: [],
              id: "1",
              name: "Bookmarks bar",
              type: "folder",
              date_added: "0",
              date_modified: "0",
            },
            other: {
              children: [],
              id: "2",
              name: "Other bookmarks",
              type: "folder",
              date_added: "0",
              date_modified: "0",
            },
            synced: {
              children: [],
              id: "3",
              name: "Mobile bookmarks",
              type: "folder",
              date_added: "0",
              date_modified: "0",
            },
          },
          version: 1,
        };

  let added = 0,
    skipped = 0;

  for (const { key, node } of incoming) {
    const rootKey =
      key === "bookmark_bar"
        ? "bookmark_bar"
        : key === "other"
          ? "other"
          : "bookmark_bar"; // Firefox roots → bookmark_bar

    const children = node.children || [];

    if (merge) {
      const existingUrls = new Set(flattenUrls(data.roots[rootKey].children));
      for (const child of children) {
        const childUrls = flattenUrls([child]);
        if (
          childUrls.length === 0 ||
          childUrls.some((u) => !existingUrls.has(u))
        ) {
          data.roots[rootKey].children.push(child);
          added += countUrls([child]);
        } else {
          skipped += childUrls.length;
        }
      }
    } else {
      data.roots[rootKey].children = children;
      added += countUrls(children);
    }
  }

  fs.writeFileSync(bookmarksPath, JSON.stringify(data, null, 2), "utf-8");
  return { added, skipped, backupPath };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const srcBrowser = BROWSERS[sourceBrowserId];
  const dstBrowser = BROWSERS[destBrowserId];

  if (!srcBrowser) {
    console.error(`❌ Unknown source browser: ${sourceBrowserId}`);
    process.exit(1);
  }
  if (!dstBrowser) {
    console.error(`❌ Unknown destination browser: ${destBrowserId}`);
    process.exit(1);
  }
  if (dstBrowser.format === "firefox") {
    console.error(
      "❌ Writing to Firefox is not supported yet (SQLite lock).\n💡 Try syncing FROM Firefox TO a Chromium browser instead.",
    );
    process.exit(1);
  }

  console.log(`\n🔖 Bookmark Sync`);
  console.log(`────────────────────────────────`);
  console.log(`📤 Source : ${srcBrowser.name}`);
  console.log(`📥 Dest   : ${dstBrowser.name}`);
  console.log(`⚙️  Mode   : ${mode === "merge" ? "🔀 Merge" : "♻️  Replace"}`);
  console.log(`────────────────────────────────\n`);

  const srcProfile = pickProfile(sourceBrowserId, "Source");
  console.log(`✅ Source profile  : ${srcProfile.name}`);

  const dstProfile = pickProfile(destBrowserId, "Destination");
  console.log(`✅ Dest profile    : ${dstProfile.name}\n`);

  console.log(`📖 Reading bookmarks from ${srcBrowser.name}...`);
  const bookmarks = readBookmarks(sourceBrowserId, srcProfile.fullPath);
  const total = bookmarks.reduce(
    (sum, { node }) => sum + countUrls(node.children || []),
    0,
  );
  console.log(`   Found ${total} bookmarks\n`);

  console.log(`✍️  Writing to ${dstBrowser.name}...`);
  const { added, skipped, backupPath } = writeChromiumBookmarks(
    dstProfile.fullPath,
    bookmarks,
    mode === "merge",
  );

  console.log(`\n────────────────────────────────`);
  console.log(`✅ Done!`);
  console.log(`   Added   : ${added}`);
  console.log(`   Skipped : ${skipped} (duplicates)`);
  console.log(`   Backup  : ${backupPath}`);
  console.log(`────────────────────────────────`);
  console.log(`\n💡 Restart ${dstBrowser.name} to see the changes.`);
}

main();
