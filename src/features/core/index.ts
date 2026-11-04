// Public client-safe entry of feature `core`: the screens the core routes
// render, and the pure helpers those routes share.

export * from './contract';
export { LANDING, resetPasswordView, safeNext, screenRedirect, type AuthScreen, type ResetPasswordView } from './domain/auth-routes';
export { LoginForm, RegisterForm, ResetPasswordForm, type LoginNotice } from './components/auth-forms';
export { MfaChallengeForm, RequiredEnroll } from './components/totp';
export { PendingScreen } from './components/pending-screen';
export { UsersScreen, type UsersScreenProps } from './components/users-screen';
export { DepartmentsCard, HolidaysEditor, SettingsForm, SettingsOverview, type AdminShortcut } from './components/settings-screen';
export { BackupsScreen } from './components/backups-screen';
export { AuditScreen, auditHref, entityLabel, type AuditScreenProps } from './components/audit-screen';
export { ProfileScreen } from './components/profile-screen';
