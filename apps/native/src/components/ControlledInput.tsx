import React from "react";
import { Control, Controller, FieldValues, Path } from "react-hook-form";
import { Input } from "./Input";
import { TextInputProps } from "react-native";

interface ControlledInputProps<T extends FieldValues>
  extends Omit<TextInputProps, "value" | "onChangeText" | "onBlur"> {
  control: Control<T>;
  name: Path<T>;
  label?: string;
  containerClassName?: string;
}

export function ControlledInput<T extends FieldValues>({
  control,
  name,
  label,
  containerClassName,
  ...props
}: ControlledInputProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({
        field: { onChange, onBlur, value },
        fieldState: { error },
      }) => (
        <Input
          label={label}
          value={value}
          onChangeText={onChange}
          onBlur={onBlur}
          error={error?.message}
          containerClassName={containerClassName}
          {...props}
        />
      )}
    />
  );
}
