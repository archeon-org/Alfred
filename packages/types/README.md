# @archeon-org/types

Shared TypeScript types for the Archeon platform.

## Installation

### From GitHub Packages (External Projects)

```bash
npm install @archeon-org/types
# or
yarn add @archeon-org/types
```

### Within the Monorepo

This package is automatically available to all workspace packages. Just import directly:

```typescript
import { User, UserType, AuthProvider } from '@archeon-org/types';
```

## Usage

### User Types

```typescript
import { User, UserType, AuthProvider, CreateUserInput } from '@archeon-org/types';

const user: User = {
  id: '123',
  email: 'user@example.com',
  firstName: 'John',
  lastName: 'Doe',
  userType: UserType.USER,
  authProvider: AuthProvider.GOOGLE,
  isEmailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const newUserInput: CreateUserInput = {
  email: 'newuser@example.com',
  firstName: 'Jane',
  lastName: 'Smith',
  userType: UserType.USER,
  authProvider: AuthProvider.LOCAL,
  isEmailVerified: false,
};
```

## Development

### Building

```bash
yarn build
```

### Publishing

This package is automatically published to GitHub Packages when changes are merged to main via Changesets workflow.

To create a changeset:

```bash
yarn changeset
```

## License

MIT
