import type {
  AppCode,
  SkillDeliveryCapability
} from "cc-switch-web-shared";

const PROXY_READY_APP_CODES: AppCode[] = [
  "codex",
  "claude-code",
  "gemini-cli"
];

const PLANNED_APP_CODES: AppCode[] = [
  "opencode",
  "openclaw"
];

export class SkillDeliveryService {
  listCapabilities(): SkillDeliveryCapability[] {
    return [
      ...PROXY_READY_APP_CODES.map<SkillDeliveryCapability>((appCode) => ({
        appCode,
        supportLevel: "proxy-only",
        recommendedPath: "active-context-injection",
        hostWriteSupported: false,
        reason:
          "Skill delivery is available through active-context system instruction injection after requests enter the CC Switch proxy."
      })),
      ...PLANNED_APP_CODES.map<SkillDeliveryCapability>((appCode) => ({
        appCode,
        supportLevel: "planned",
        recommendedPath: "wait-for-stable-host-contract",
        hostWriteSupported: false,
        reason:
          "Skill asset governance is ready, but stable host routing and upstream request contracts still need verification before promising runtime delivery."
      }))
    ];
  }
}
