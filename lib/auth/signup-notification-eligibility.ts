export type SignupEmailStateForNotification = {
  user_id: string;
  email: string;
  email_confirmed: boolean;
};

export function shouldNotifyForPostSignupEmailState(
  emailState: SignupEmailStateForNotification | null | undefined,
  createdUserId: string,
): boolean {
  return Boolean(emailState && emailState.user_id === createdUserId);
}
