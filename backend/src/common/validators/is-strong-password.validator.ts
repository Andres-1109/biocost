import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

// Mínimo 8 caracteres, al menos una mayúscula y un número (HU-01, HU-04, HU-05).
const STRONG_PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && STRONG_PASSWORD_REGEX.test(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} debe tener mínimo 8 caracteres, al menos una mayúscula y un número.`;
        },
      },
    });
  };
}
