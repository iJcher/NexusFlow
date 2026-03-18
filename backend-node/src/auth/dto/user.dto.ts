export class UserDto {
  phoneNumber: string;
  password: string;
}

export class AuthTokenDto {
  type: string;
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}
