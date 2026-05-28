' @example: sugar/generic-tlist/03-method
' @demonstrates: Sub/Function generico livre (nivel namespace) monomorfizado para forma concreta
' @diagnostics: none
' @transpiled-to: sugar/generic-tlist/_expected/03-method.bas
'
Namespace mod_demo

   Public Function Wrap<T>(pValue As T) As T
      Wrap = pValue
   End Function

   Class TDemo
      Public Sub Run()
         Dim _wrapped As Integer = Wrap<Integer>(42)
      End Sub
   End Class

End Namespace
