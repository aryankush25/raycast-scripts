import {
  Action,
  ActionPanel,
  Color,
  Detail,
  Icon,
  List,
  Toast,
  showToast,
  useNavigation,
} from "@raycast/api";
import { execSync } from "child_process";
import { useEffect, useState } from "react";

interface Browser {
  id: string;
  name: string;
  isDefault: boolean;
}

const BROWSER_NAMES: Record<string, string> = {
  safari: "Safari",
  chrome: "Google Chrome",
  firefox: "Firefox",
  vivaldi: "Vivaldi",
  brave: "Brave Browser",
  opera: "Opera",
  edge: "Microsoft Edge",
  arc: "Arc",
  zen: "Zen Browser",
  chromium: "Chromium",
  waterfox: "Waterfox",
  orion: "Orion",
};

function formatName(id: string): string {
  return BROWSER_NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

function loadBrowsers(): Browser[] {
  const output = execSync("defaultbrowser", { encoding: "utf-8" });
  return output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const isDefault = line.startsWith("*");
      const id = line.replace(/^\*?\s*/, "").trim();
      return { id, name: formatName(id), isDefault };
    });
}

async function applyDefault(browser: Browser, onSuccess: (id: string) => void) {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: `Setting ${browser.name} as default…`,
  });
  try {
    execSync(`defaultbrowser ${browser.id}`);
    try {
      // Auto-dismiss the macOS confirmation dialog
      execSync(
        `osascript -e 'tell application "System Events" to tell process "CoreServicesUIAgent" to click button 1 of window 1'`,
        { timeout: 2000 }
      );
    } catch {
      // Dialog may not appear on all macOS versions — safe to ignore
    }
    toast.style = Toast.Style.Success;
    toast.title = `${browser.name} is now your default browser`;
    onSuccess(browser.id);
  } catch {
    toast.style = Toast.Style.Failure;
    toast.title = `Failed to set ${browser.name} as default`;
  }
}

function BrowserDetail({
  browser,
  onConfirm,
}: {
  browser: Browser;
  onConfirm: () => Promise<void>;
}) {
  const { pop } = useNavigation();

  const markdown = browser.isDefault
    ? `# ${browser.name}\n\n✅ This is already your **default browser**.\n\nAll links and web protocols open in ${browser.name}.`
    : `# Set Default Browser\n\n**${browser.name}** will handle all links and web protocols once set as default.\n\nPress **Set as Default** to confirm.`;

  return (
    <Detail
      markdown={markdown}
      navigationTitle={browser.name}
      actions={
        <ActionPanel>
          {browser.isDefault ? (
            <Action
              title="Already Default"
              icon={{ source: Icon.CheckCircle, tintColor: Color.Green }}
            />
          ) : (
            <Action
              title="Set as Default"
              icon={{ source: Icon.CheckCircle, tintColor: Color.Green }}
              onAction={async () => {
                await onConfirm();
                pop();
              }}
            />
          )}
          <Action title="Back to Browser List" icon={Icon.ArrowLeft} onAction={pop} />
        </ActionPanel>
      }
    />
  );
}

export default function BrowserList() {
  const [browsers, setBrowsers] = useState<Browser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { push } = useNavigation();

  useEffect(() => {
    try {
      setBrowsers(loadBrowsers());
    } catch {
      setError("'defaultbrowser' not found. Install it: brew install defaultbrowser");
    } finally {
      setIsLoading(false);
    }
  }, []);

  function markDefault(id: string) {
    setBrowsers((prev) => prev.map((b) => ({ ...b, isDefault: b.id === id })));
  }

  if (error) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title="Missing dependency"
          description={error}
        />
      </List>
    );
  }

  return (
    <List isLoading={isLoading} navigationTitle="Choose Default Browser">
      {browsers.map((browser) => (
        <List.Item
          key={browser.id}
          title={browser.name}
          icon={
            browser.isDefault
              ? { source: Icon.CheckCircle, tintColor: Color.Green }
              : { source: Icon.Globe, tintColor: Color.SecondaryText }
          }
          accessories={
            browser.isDefault ? [{ tag: { value: "Default", color: Color.Green } }] : []
          }
          actions={
            <ActionPanel>
              <Action
                title="View & Confirm"
                icon={Icon.Eye}
                onAction={() =>
                  push(
                    <BrowserDetail
                      browser={browser}
                      onConfirm={() => applyDefault(browser, markDefault)}
                    />
                  )
                }
              />
              {!browser.isDefault && (
                <Action
                  title="Set as Default"
                  icon={Icon.CheckCircle}
                  shortcut={{ modifiers: ["cmd"], key: "return" }}
                  onAction={() => applyDefault(browser, markDefault)}
                />
              )}
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
