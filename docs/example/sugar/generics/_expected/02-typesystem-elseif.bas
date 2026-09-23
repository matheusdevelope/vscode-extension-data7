' @example: sugar/generics/_expected/02-typesystem-elseif
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/generics/02-typesystem-elseif
' @diagnostics: none
'
Class CheckBox
End Class
Class TextBox
End Class
Class MemoTextBox
End Class
Class DateTextBox
End Class
Dim check As TKind_CheckBox
Dim box As TKind_TextBox
Dim memo As TKind_MemoTextBox
Dim dateBox As TKind_DateTextBox
Class TKind_CheckBox
   Function Label() As String
      Label = "check"
   End Function
End Class
Class TKind_TextBox
   Function Label() As String
      Label = "text"
   End Function
End Class
Class TKind_MemoTextBox
   Function Label() As String
      Label = "memo"
   End Function
End Class
Class TKind_DateTextBox
   Function Label() As String
      Label = "other"
   End Function
End Class
