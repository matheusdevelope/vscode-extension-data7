' @example: sugar/generic-tlist/03-method
' @demonstrates: Sub/Function generico livre (nivel namespace) monomorfizado para forma concreta
' @diagnostics: none
' @transpiled-to: sugar/generic-tlist/_expected/03-method.bas
'
Namespace mod_demo


   Class TDemo
      Public Sub Run()
         Dim _wrapped As Integer = Wrap_Integer(42)
      End Sub
   End Class

   Public Function Wrap_Integer(pValue As Integer) As Integer
      Wrap_Integer = pValue
   End Function
End Namespace
