import { StyleSheet } from "react-native";
import { fontFamily, colors, font, space, radius } from "../theme";

export const onboardingStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },

  container: {
    flex: 1,
    justifyContent: "space-between",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },

  backButton: {
    padding: 4,
    minWidth: 32,
    justifyContent: "center",
  },

  backText: {
    color: "#6B6B6B",
    fontSize: 20,
  },

  progressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: "#E8E8E8",
    borderRadius: 3,
  },

  content: {
    flex: 1,
    justifyContent: "flex-start",
    paddingHorizontal: 24,
    paddingTop: 40,
  },

  heading: {
    fontFamily: fontFamily.heading,
    fontSize: 32,
    fontWeight: "600",
    color: colors.text.primary,
    letterSpacing: -0.5,
  },

  body: {
    marginTop: 12,
    fontSize: 15,
    color: "#999999",
    lineHeight: 22,
  },

  footer: {
    paddingHorizontal: 24,
    paddingVertical: 24,
    paddingBottom: 34,
  },

  footerCentered: {
    paddingHorizontal: 24,
    paddingVertical: 24,
    paddingBottom: 34,
    alignItems: "center",
  },

  primaryBtn: {
    width: "100%",
    height: 56,
    borderRadius: 12,
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
  },

  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
  },

  primaryBtnDisabled: {
    backgroundColor: "#E8E8E8",
  },

  primaryBtnTextDisabled: {
    color: "#B0B0B0",
  },

  secondaryBtn: {
    width: "100%",
    height: 56,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0.5,
    borderColor: "rgba(0,0,0,0.12)",
  },

  secondaryBtnText: {
    color: "#1A1A1A",
    fontSize: 16,
    fontWeight: "500",
  },

  input: {
    width: "100%",
    height: 56,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 0.5,
    borderColor: "rgba(0,0,0,0.1)",
    marginTop: 20,
    fontSize: 16,
  },

  inputRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },

  countryCodeButton: {
    width: 72,
    height: 56,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 0.5,
    borderColor: "rgba(0,0,0,0.1)",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flexDirection: "row",
  },

  countryCodeText: {
    fontSize: 18,
    fontWeight: "500",
    color: "#1A1A1A",
  },

  countryCodeFlag: {
    fontSize: 16,
  },

  phoneInput: {
    flex: 1,
    height: 56,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 0.5,
    borderColor: "rgba(0,0,0,0.1)",
    fontSize: 16,
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: "rgba(0,0,0,0.08)",
    padding: 16,
  },

  cardTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1A1A1A",
  },

  cardSubtitle: {
    fontSize: 13,
    color: "#6B6B6B",
    marginTop: 6,
  },
});

export default onboardingStyles;
