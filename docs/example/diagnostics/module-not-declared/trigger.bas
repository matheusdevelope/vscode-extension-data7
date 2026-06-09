' @example: diagnostics/module-not-declared/trigger
' @demonstrates: módulo existe no repositório privado mas não foi adicionado a data7.json#dependencies
' @diagnostics: module-not-declared@6
' @requires: módulo "mod_shared_utility" no repositório privado E ausência da entrada em data7.json
'
Imports mod_shared_utility

Namespace mod_consumer
   Class TConsumer
      Public Sub Run()
      End Sub
   End Class
End Namespace
