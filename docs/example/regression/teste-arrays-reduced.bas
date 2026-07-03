' @example: regression/teste-arrays-reduced
' @demonstrates: fixture reduzido do demo teste_arrays para parser, linter e supersets de heranca
' @diagnostics: typed-const-unsupported@26, invalid-shared-member@23, redundant-public-modifier@25, unused-declaration@26, loose-value-statement@28, abstract-instantiation@29, sealed-inheritance@15, mustoverride-not-implemented@18
'
Namespace mod_teste_arrays_reduced
   MustInherit Class BaseAbstrata
      MustOverride Overridable Sub Execute()
      End Sub
   End Class

   NotInheritable Class ClasseSelada
   End Class

   Class HerdaSelada
      Inherits ClasseSelada
   End Class

   Class NaoImplementa
      Inherits BaseAbstrata
   End Class

   Class Uso
      Shared _propSharedNaoValida As Integer

      Public Sub Run(pItem As TObject)
         Const minhaConstInteger As Integer = 1234
         Dim naoUsada As Integer
         me._propSharedNaoValida
         Dim item As BaseAbstrata = New BaseAbstrata()
      End Sub
   End Class
End Namespace
