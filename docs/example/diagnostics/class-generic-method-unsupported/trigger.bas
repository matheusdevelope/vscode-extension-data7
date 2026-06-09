' @example: diagnostics/class-generic-method-unsupported/trigger
' @demonstrates: a generic method declared inside a non-generic class
' @diagnostics: class-generic-method-unsupported@9
' @requires: only emitted by the AST monomorphization engine (Fase 6); the live linter does not yet detect generic methods inside classes.
'
Namespace mod_demo

   Class Helper
      Sub Process<T>(pItem As T)
         ' Generic methods inside classes are pruned by the AST engine
         ' with a class-generic-method-unsupported warning.
      End Sub
   End Class

End Namespace
