import type { ParameterInfo } from "../../analysis/symbol-indexer";
import type { SystemContainer, SystemSymbolInfo } from "../types";
import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";

const SUPPORTED_TYPES = [
  "AnsiChar",
  "AnsiString",
  "Boolean",
  "Cardinal",
  "Currency",
  "Double",
  "Extended",
  "Int64",
  "Integer",
  "ShortInt",
  "Single",
  "SmallInt",
  "String",
  "TDateTime",
  "WideChar",
  "Word",
] as const satisfies readonly SystemContainer[];

const INTEGER_TYPES = new Set<SystemContainer>([
  "Cardinal",
  "Int64",
  "Integer",
  "ShortInt",
  "SmallInt",
  "Word",
]);

const SIGNATURES = `
Boolean.ToString as string
Boolean.ToInt32 as integer
Boolean.ToISOString as String
Boolean.ToISOAnsiString as AnsiString
Boolean.FromISOString(Value as String) as Boolean
Boolean.FromISOAnsiString(Value as AnsiString) as Boolean
Boolean.Equals(Value as Boolean) as boolean
SmallInt.ToString as String
SmallInt.Equals(Value as SmallInt) as boolean
SmallInt.MinValue as SmallInt
SmallInt.MaxValue as SmallInt
ShortInt.ToString as String
ShortInt.Equals(Value as ShortInt) as boolean
ShortInt.MinValue as ShortInt
ShortInt.MaxValue as ShortInt
Word.ToString as String
Word.Equals(Value as Word) as boolean
Word.MinValue as Word
Word.MaxValue as Word
Cardinal.ToString as String
Cardinal.Equals(Value as Cardinal) as boolean
Cardinal.MinValue as Cardinal
Cardinal.MaxValue as Cardinal
Double.ToString as String
Double.ToStringFormat(Format as String) as String
Double.ToISOString as String
Double.ToISOAnsiString as AnsiString
Double.FromISOString(Value as String) as double
Double.FromISOAnsiString(Value as AnsiString) as double
Double.RoundTo(const Digit as integer) as double
Double.Equals(const Value as Double) as boolean
Double.Round as Int64
Double.Power(Exponent as Extended) as double
Double.Trunc as Int64
Double.Floor as Integer
Double.Ceil as Integer
Double.Min(Value as Double) as Double
Double.Max(Value as Double) as Double
TDateTime.ToString as String
TDateTime.ToStringFormat(const FormatStr as String) as String
TDateTime.ToStringISO as String
TDateTime.FromISOAnsiString(const Value as AnsiString) as TDateTime
TDateTime.ToAnsiStringISO as AnsiString
TDateTime.FromISOString(const Value as String) as TDateTime
TDateTime.Equals(const Value as TDateTime) as boolean
TDateTime.ToInt32 as Integer
TDateTime.IsDate as boolean
TDateTime.IsDateTime as boolean
TDateTime.IsTime as boolean
TDateTime.Date as TDateTime
TDateTime.Time as TDateTime
TDateTime.Now as TDateTime
TDateTime.IsInLeapYear as boolean
TDateTime.DateOf as TDateTime
TDateTime.TimeOf as TDateTime
TDateTime.YearOf as Word
TDateTime.MonthOf as Word
TDateTime.DayOf as Word
TDateTime.HourOf as Word
TDateTime.MinuteOf as Word
TDateTime.SecondOf as Word
TDateTime.MilliSecondOf as Word
TDateTime.WeeksInYear as Word
TDateTime.DaysInYear as Word
TDateTime.Today as TDateTime
TDateTime.Yesterday as TDateTime
TDateTime.Tomorrow as TDateTime
TDateTime.YearSpan(const Value as TDateTime) as Double
TDateTime.MonthSpan(const Value as TDateTime) as Double
TDateTime.WeekSpan(const Value as TDateTime) as Double
TDateTime.DaySpan(const Value as TDateTime) as Double
TDateTime.HourSpan(const Value as TDateTime) as Double
TDateTime.MinuteSpan(const Value as TDateTime) as Double
TDateTime.SecondSpan(const Value as TDateTime) as Double
TDateTime.MilliSecondSpan(const Value as TDateTime) as Double
TDateTime.AddYears(const ANumberOfYears as Integer = 1) as TDateTime
TDateTime.AddWeeks(const ANumberOfWeeks as Integer = 1) as TDateTime
TDateTime.AddDays(const ANumberOfDays as Integer = 1) as TDateTime
TDateTime.AddHours(const ANumberOfHours as Int64 = 1) as TDateTime
TDateTime.AddMinutes(const ANumberOfMinutes as Int64 = 1) as TDateTime
TDateTime.AddSeconds(const ANumberOfSeconds as Int64 = 1) as TDateTime
TDateTime.AddMilliSeconds(const ANumberOfMilliSeconds as Int64 = 1) as TDateTime
TDateTime.EncodeDateTime(const AYear, AMonth, ADay, AHour, AMinute, ASecond, AMilliSecond as Word) as TDateTime
TDateTime.EncodeDate(const AYear, AMonth, ADay as Word) as TDateTime
TDateTime.EncodeTime(const AHour, AMinute, ASecond, AMilliSecond as Word) as TDateTime
TDateTime.Min(const Value as TDateTime) as TDateTime
TDateTime.Max(const Value as TDateTime) as TDateTime
TDateTime.MinValue as TDateTime
TDateTime.MaxValue as TDateTime
Single.ToString as String
Single.Equals(const Value as Single) as boolean
Single.Min(const Value as Single) as Single
Single.Max(const Value as Single) as Single
Extended.ToString as String
Extended.ToStringFormat(const FormatStr as String) as String
Extended.ToISOString as String
Extended.ToISOAnsiString as AnsiString
Extended.FromISOString(const Value as String) as Extended
Extended.FromISOAnsiString(const Value as AnsiString) as Extended
Extended.RoundTo(const Digit as integer) as Extended
Extended.Equals(const Value as Extended) as boolean
Extended.Round as Int64
Extended.Power(const Exponent as Extended) as Extended
Extended.Trunc as Int64
Extended.Floor as Integer
Extended.Ceil as Integer
Extended.Min(const Value as Extended) as Extended
Extended.Max(const Value as Extended) as Extended
Currency.ToString as String
Currency.ToStringFormat(const FormatStr as String) as String
Currency.ToISOString as String
Currency.ToISOAnsiString as AnsiString
Currency.FromISOString(const Value as String) as Currency
Currency.FromISOAnsiString(const Value as AnsiString) as Currency
Currency.RoundTo(const Digit as integer) as Currency
Currency.Equals(const Value as Currency) as boolean
Currency.Round as Int64
Currency.Power(const Exponent as Extended) as Currency
Currency.Trunc as Int64
Currency.Floor as Integer
Currency.Ceil as Integer
Currency.Min(const Value as Currency) as Currency
Currency.Max(const Value as Currency) as Currency
AnsiChar.ToString as String
AnsiChar.Equals(const Value as AnsiChar) as boolean
WideChar.ToString as String
WideChar.Equals(const Value as WideChar) as boolean
Integer.ToString as String
Integer.ToDate as TDateTime
Integer.ToHex(Digits as Integer = 8) as String
Integer.FromHex(const Value as String) as Integer
Integer.FromHexAnsi(const Value as AnsiString) as Integer
Integer.Equals(const Value as Integer) as boolean
Integer.Min(const Value as Integer) as Integer
Integer.Max(const Value as Integer) as Integer
Integer.MinValue as Integer
Integer.MaxValue as Integer
Int64.ToString as String
Int64.ToDate as TDateTime
Int64.ToHex(Digits as Integer = 8) as String
Int64.FromHex(const Value as String) as Int64
Int64.FromHexAnsi(const Value as AnsiString) as Int64
Int64.Equals(const Value as Int64) as boolean
Int64.Min(const Value as Int64) as Int64
Int64.Max(const Value as Int64) as Int64
Int64.MinValue as Int64
Int64.MaxValue as Int64
AnsiString.ToString as String
AnsiString.Replace(const OldPattern as AnsiString, const NewPattern as AnsiString) as AnsiString
AnsiString.Equals(const Value as AnsiString) as boolean
AnsiString.Length as integer
AnsiString.ToDate as TDateTime
AnsiString.ToTime as TDateTime
AnsiString.ToDateTime as TDateTime
AnsiString.ToCurrency as Currency
AnsiString.ToExtended as Extended
AnsiString.ToDouble as Double
AnsiString.ToCardinal as Cardinal
AnsiString.ToShortInt as ShortInt
AnsiString.ToSmallInt as SmallInt
AnsiString.ToSingle as Single
AnsiString.ToWord as Word
AnsiString.ToInt32 as Integer
AnsiString.ToInt64 as Int64
AnsiString.ToBoolean as Boolean
AnsiString.ToByteBool as ByteBool
AnsiString.ToLongBool as LongBool
AnsiString.ToWordBool as WordBool
AnsiString.ToUTF8 as UTF8String
AnsiString.FromUTF8(const Value as UTF8String) as AnsiString
AnsiString.ToUnicode as String
AnsiString.FromUnicode(const Value as String) as AnsiString
AnsiString.ToBase64 as AnsiString
AnsiString.FromBase64(const Value as AnsiString) as AnsiString
AnsiString.ISOToBoolean as Boolean
AnsiString.ISOToDate as TDateTime
AnsiString.ISOToTime as TDateTime
AnsiString.ISOToDateTime as TDateTime
AnsiString.ISOToCurrency as Currency
AnsiString.ISOToExtended as Extended
AnsiString.ISOToDouble as Double
AnsiString.Copy(Index as integer, Count as integer) as AnsiString
AnsiString.Delete(Index as integer, Count as integer) as AnsiString
AnsiString.Trim as AnsiString
AnsiString.TrimLeft as AnsiString
AnsiString.TrimRight as AnsiString
AnsiString.Contains(const Value as AnsiString) as boolean
AnsiString.Pos(const Value as AnsiString) as integer
AnsiString.IndexOf(const Value as AnsiString, const StartIndex as integer = 1) as integer
AnsiString.Quoted(const Quote as AnsiChar = "'") as AnsiString
AnsiString.Dequoted(const Quote as AnsiChar = "'") as AnsiString
AnsiString.ToUpper as AnsiString
AnsiString.ToLower as AnsiString
AnsiString.Split(const Seperator as AnsiString) as TAnsiStringDynArray
AnsiString.SplitEx(const Seperator as AnsiChar, const Quotes as Boolean, const Quote as AnsiChar = "'", const TrimText as Boolean = false) as TAnsiStringDynArray
AnsiString.Join(const Value as TAnsiStringDynArray, const Seperator as AnsiString) as AnsiString
AnsiString.Insert(const Value as AnsiString, Index as integer) as AnsiString
AnsiString.IsNumeric as boolean
AnsiString.IsAlpha as boolean
AnsiString.IsAlphaNumeric as boolean
AnsiString.Match(const Mask as String) as boolean
AnsiString.EndsWith(const Value as AnsiString) as boolean
AnsiString.StartsWith(const Value as AnsiString) as boolean
AnsiString.Reverse as AnsiString
AnsiString.Left(const Length as Integer) as AnsiString
AnsiString.Right(const Length as Integer) as AnsiString
AnsiString.AppendA(const Value as AnsiString) as AnsiString
AnsiString.AppendW(const Value as String) as AnsiString
AnsiString.AppendLineA(const Value as AnsiString) as AnsiString
AnsiString.AppendLineW(const Value as String) as AnsiString
AnsiString.Lastchar as AnsiChar
AnsiString.LastDelimiter(const Delimiters as AnsiString = "") as Integer
AnsiString.FindDelimiter(const Delimiters as AnsiString = "", const StartIdx as integer = 1) as Integer
AnsiString.StringOfChar(const Ch as AnsiChar, const Count as integer) as AnsiString
String.ToString as String
String.Replace(const OldPattern as String, const NewPattern as String) as String
String.Equals(const Value as String) as boolean
String.Length as integer
String.ToDate as TDateTime
String.ToTime as TDateTime
String.ToDateTime as TDateTime
String.ToCurrency as Currency
String.ToExtended as Extended
String.ToDouble as Double
String.ToCardinal as Cardinal
String.ToShortInt as ShortInt
String.ToSmallInt as SmallInt
String.ToSingle as Single
String.ToWord as Word
String.ToInt32 as Integer
String.ToInt64 as Int64
String.ToBoolean as Boolean
String.ToByteBool as ByteBool
String.ToLongBool as LongBool
String.ToWordBool as WordBool
String.ToUTF8 as UTF8String
String.FromUTF8(const Value as UTF8String) as String
String.ToAnsi as AnsiString
String.FromAnsi(const Value as AnsiString) as String
String.ToBase64 as String
String.FromBase64(const Value as String) as String
String.ISOToBoolean as Boolean
String.ISOToDate as TDateTime
String.ISOToTime as TDateTime
String.ISOToDateTime as TDateTime
String.ISOToCurrency as Currency
String.ISOToExtended as Extended
String.ISOToDouble as Double
String.Copy(Index as integer, Count as integer) as String
String.Delete(Index as integer, Count as integer) as String
String.Trim as String
String.TrimLeft as String
String.TrimRight as String
String.Contains(const Value as String) as boolean
String.Pos(const Value as String) as integer
String.IndexOf(const Value as String, const StartIndex as integer = 1) as integer
String.Quoted(const Quote as WideChar = "'") as String
String.Dequoted(const Quote as WideChar = "'") as String
String.ToUpper as String
String.ToLower as String
String.Split(const Seperator as String) as TStringDynArray
String.SplitEx(const Seperator as WideChar, const Quotes as Boolean, const Quote as WideChar = "'", const TrimText as Boolean = false) as TStringDynArray
String.Join(const Value as TStringDynArray, const Seperator as String) as String
String.Insert(const Value as String, Index as integer) as String
String.IsNumeric as boolean
String.IsAlpha as boolean
String.IsAlphaNumeric as boolean
String.Match(const Mask as String) as boolean
String.EndsWith(const Value as String) as boolean
String.StartsWith(const Value as String) as boolean
String.Reverse as String
String.Left(const Length as Integer) as String
String.Right(const Length as Integer) as String
String.AppendA(const Value as AnsiString) as String
String.AppendW(const Value as String) as String
String.AppendLineA(const Value as AnsiString) as String
String.AppendLineW(const Value as String) as String
String.Lastchar as WideChar
String.LastDelimiter(const Delimiters as String = "") as Integer
String.FindDelimiter(const Delimiters as String = "", const StartIdx as integer = 1) as Integer
String.StringOfChar(const Ch as WideChar, const Count as integer) as String
`;

interface ParsedSignature {
  readonly containerName: SystemContainer;
  readonly name: string;
  readonly returnType: string;
  readonly parameters: readonly ParameterInfo[];
}

function splitParams(paramsSource: string): string[] {
  const rawParts = paramsSource
    .split(",")
    .map((param) => param.trim())
    .filter((param) => param.length > 0);

  const params: string[] = [];
  let pendingNames: string[] = [];

  for (const part of rawParts) {
    if (/\s+as\s+/i.test(part)) {
      const withoutConst = part.replace(/^const\s+/i, "");
      const asIndex = withoutConst.toLowerCase().lastIndexOf(" as ");
      if (asIndex < 0) {
        throw new Error(`Invalid Data7 Basic parameter signature: ${part}`);
      }
      const currentName = withoutConst.slice(0, asIndex).trim();
      const typeAndDefault = withoutConst.slice(asIndex + 4).trim();
      for (const name of [...pendingNames, currentName]) {
        params.push(`${name} as ${typeAndDefault}`);
      }
      pendingNames = [];
      continue;
    }

    pendingNames.push(part.replace(/^const\s+/i, ""));
  }

  if (pendingNames.length > 0) {
    throw new Error(`Invalid grouped Data7 Basic parameters: ${paramsSource}`);
  }

  return params;
}

function parseParam(source: string): ParameterInfo {
  const withoutConst = source.replace(/^const\s+/i, "");
  const [declaration, defaultValue] = withoutConst.split("=").map((part) => part.trim());
  const asIndex = declaration?.toLowerCase().lastIndexOf(" as ") ?? -1;
  if (!declaration || asIndex < 0) {
    throw new Error(`Invalid Data7 Basic parameter signature: ${source}`);
  }
  const type = declaration.slice(asIndex + 4).trim();
  const names = declaration
    .slice(0, asIndex)
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  const firstName = names[0];
  if (!firstName) {
    throw new Error(`Invalid Data7 Basic parameter name: ${source}`);
  }
  return {
    name: firstName,
    type,
    isByRef: false,
    isOptional: defaultValue !== undefined,
    defaultValue,
  };
}

function parseSignature(line: string): ParsedSignature {
  const match = line.match(
    /^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)(?:\((.*)\))?\s+as\s+(.+)$/,
  );
  if (!match) {
    throw new Error(`Invalid Data7 Basic member signature: ${line}`);
  }
  const [, containerName, name, paramsSource, returnType] = match;
  if (!containerName || !name || !returnType) {
    throw new Error(`Incomplete Data7 Basic member signature: ${line}`);
  }
  return {
    containerName: containerName as SystemContainer,
    name,
    returnType: returnType.trim(),
    parameters: paramsSource ? splitParams(paramsSource).map(parseParam) : [],
  };
}

function primitiveClass(typeName: SystemContainer): SystemSymbolInfo {
  return {
    name: typeName,
    kind: "class",
    type: typeName,
    isShared: false,
    isPrivate: false,
    range: { ...SYSTEM_RANGE },
    fileUri: SYSTEM_URI,
    inheritsFrom: INTEGER_TYPES.has(typeName) ? "Integer" : "TPrimitive",
    description: `Tipo primitivo Data7 ${typeName}.`,
  };
}

function primitiveMember(signature: ParsedSignature): SystemSymbolInfo {
  return {
    name: signature.name,
    kind: "method",
    type: signature.returnType,
    isShared: false,
    isPrivate: false,
    parameters: [...signature.parameters],
    range: { ...SYSTEM_RANGE },
    fileUri: SYSTEM_URI,
    containerName: signature.containerName,
    description: `Membro ${signature.containerName}.${signature.name} definido pelo manual de funcoes Basic.`,
  };
}

export const symbols: SystemSymbolInfo[] = (() => {
  const all: SystemSymbolInfo[] = [
    ...SUPPORTED_TYPES.map(primitiveClass),
    ...SIGNATURES.trim()
      .split(/\r?\n/)
      .map((line) => primitiveMember(parseSignature(line))),
  ];

  // ERP accepts `value.ToString(format)` in addition to the documented
  // `ToStringFormat(format)`. Attach the format signature as a ToString overload
  // so arity checks do not depend solely on TPrimitive inheritance order.
  for (const formatMember of all) {
    if (formatMember.kind !== "method" || formatMember.name.toLowerCase() !== "tostringformat") {
      continue;
    }
    const toStringMember = all.find(
      (symbol) =>
        symbol.kind === "method" &&
        symbol.name.toLowerCase() === "tostring" &&
        symbol.containerName === formatMember.containerName,
    );
    if (!toStringMember || !formatMember.parameters) continue;
    toStringMember.overloads = [...(toStringMember.overloads ?? []), formatMember.parameters];
  }

  return all;
})();
