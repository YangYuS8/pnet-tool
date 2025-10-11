import { DesktopWindowChrome } from "@/components/desktop/window-chrome";
import { SettingsPage } from "@/components/settings/settings-page";

export default function SettingsRoute() {
  return (
    <DesktopWindowChrome>
      <SettingsPage />
    </DesktopWindowChrome>
  );
}
