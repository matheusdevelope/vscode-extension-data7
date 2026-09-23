' @example: sugar/generics/01-typesystem-is-type
' @demonstrates: TypeSystem.IsType ramifica pelo tipo concreto do genérico, não pela herança — omite CharCase só quando T é exatamente MemoTextBox
' @diagnostics: none
' @transpiled-to: sugar/generics/_expected/01-typesystem-is-type.bas
'
Class TcxCustomTextEdit
End Class

Class MemoTextBox
   Inherits TcxCustomTextEdit
End Class

Class TextBox
   Inherits TcxCustomTextEdit
End Class

Class TLabeled<T>
   <# If Not TypeSystem.IsType(T, "MemoTextBox") Then #>
   Property CharCase As Integer
      Get
         CharCase = 0
      End Get
      Set(pValue As Integer)
      End Set
   End Property
   <# End If #>
End Class

Dim memo As TLabeled<MemoTextBox>
Dim box As TLabeled<TextBox>
