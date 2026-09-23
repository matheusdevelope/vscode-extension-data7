' @example: sugar/generics/_expected/01-typesystem-is-type
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/generics/01-typesystem-is-type
' @diagnostics: none
'
Class TcxCustomTextEdit
End Class
Class MemoTextBox
   Inherits TcxCustomTextEdit
End Class
Class TextBox
   Inherits TcxCustomTextEdit
End Class
Dim memo As TLabeled_MemoTextBox
Dim box As TLabeled_TextBox
Class TLabeled_MemoTextBox
End Class
Class TLabeled_TextBox
   Property CharCase As Integer
      Get
         CharCase = 0
      End Get
      Set(pValue As Integer)
      End Set
   End Property
End Class
