' @example: sugar/generics/02-typesystem-elseif
' @demonstrates: TypeSystem ElseIf / Else If encadeia verificações; o primeiro ramo verdadeiro vence
' @diagnostics: none
' @transpiled-to: sugar/generics/_expected/02-typesystem-elseif.bas
'
Class CheckBox
End Class

Class TextBox
End Class

Class MemoTextBox
End Class

Class DateTextBox
End Class

Class TKind<T>
   Function Label() As String
      <# If TypeSystem.IsType(T, "CheckBox") Then #>
      Label = "check"
      <# ElseIf TypeSystem.IsType(T, "TextBox") Then #>
      Label = "text"
      <# Else If TypeSystem.IsType(T, "MemoTextBox") Then #>
      Label = "memo"
      <# Else #>
      Label = "other"
      <# End If #>
   End Function
End Class

Dim check As TKind<CheckBox>
Dim box As TKind<TextBox>
Dim memo As TKind<MemoTextBox>
Dim dateBox As TKind<DateTextBox>
