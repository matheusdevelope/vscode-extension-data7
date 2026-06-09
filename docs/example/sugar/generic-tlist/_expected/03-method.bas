' @example: sugar/generic-tlist/_expected/03-method
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/generic-tlist/03-method
' @diagnostics: none
'
Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim _wrapped As Integer = Wrap_Integer(42)
      End Sub
   End Class
   Public Function Wrap_Integer(pValue As Integer) As Integer
      Wrap = pValue
   End Function
End Namespace
